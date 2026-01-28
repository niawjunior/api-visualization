
import { NextRequest, NextResponse } from 'next/server';
import { analyzeDependencies } from '@/lib/server/analyze';

export async function POST(req: NextRequest) {
    try {
        const { path } = await req.json();
        
        if (!path) {
            return NextResponse.json({ error: 'Path is required' }, { status: 400 });
        }

        const result = await analyzeDependencies(path);
        
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Analysis error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
