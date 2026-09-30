import { NextResponse } from 'next/server';
import { Hospital } from '@/lib/db/models/index';

export async function GET() {
  try {
    const count = await Hospital.count();
    return NextResponse.json({ setupRequired: count === 0 });
  } catch (err) {
    console.error('Setup status error:', err);
    return NextResponse.json({ error: 'Failed to check setup status' }, { status: 500 });
  }
}
