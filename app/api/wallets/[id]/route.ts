import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';

export const PUT = async (
  request: Request,
  { params }: { params: { id: string } }
) => {
  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body?.label !== undefined) {
    const label = String(body.label).trim();
    if (!label) {
      return NextResponse.json({ error: 'label cannot be empty' }, { status: 400 });
    }
    updates.label = label;
  }

  if (body?.isArchived !== undefined) {
    if (typeof body.isArchived === 'boolean') {
      updates.isArchived = body.isArchived;
    } else if (body.isArchived === 'true' || body.isArchived === 'false') {
      updates.isArchived = body.isArchived === 'true';
    } else {
      return NextResponse.json({ error: 'isArchived must be boolean' }, { status: 400 });
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  try {
    const wallet = await prisma.wallet.update({
      where: { id: params.id },
      data: updates
    });
    return NextResponse.json(wallet);
  } catch {
    return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
  }
};

export const DELETE = async (
  _request: Request,
  { params }: { params: { id: string } }
) => {
  try {
    await prisma.wallet.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
  }
};
