import { NextResponse } from 'next/server';
import { deleteClass, updateClass } from '../../../../src/server/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const success = await deleteClass(params.id);
    if (!success) return NextResponse.json({ error: 'Failed to delete from Supabase' }, { status: 500 });
    return NextResponse.json({ success: true }, { 
      headers: { 'Cache-Control': 'no-store' } 
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const updated = await updateClass(params.id, body);
    return NextResponse.json({ class: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
