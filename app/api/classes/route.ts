import { NextResponse } from 'next/server';
import { getAllClasses, createClass } from '../../../src/server/db';
import { extractYouTubeId, verifyYouTubeEmbeddability } from '../../../src/lib/youtube';
import { checkScheduleOverlap } from '../../../src/lib/overlap';

export async function GET() {
  try {
    const classes = await getAllClasses();
    return NextResponse.json({ classes });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, subject, faculty, topic, description, youtube_url, start_at, duration_min } = body;

    if (!title || !youtube_url || !start_at || !duration_min) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const youtube_id = extractYouTubeId(youtube_url);
    if (!youtube_id) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    const existingClasses = await getAllClasses();
    const overlap = checkScheduleOverlap(
      {
        start_at,
        duration_min: Number(duration_min),
      },
      existingClasses
    );

    if (overlap.hasOverlap) {
      return NextResponse.json(
        {
          error: 'Overlap Conflict',
          message: overlap.message,
          conflictingClass: overlap.conflictingClass,
        },
        { status: 409 }
      );
    }

    const embedResult = await verifyYouTubeEmbeddability(youtube_id);

    const newClass = await createClass({
      title: title.trim(),
      subject: subject || 'Physics',
      faculty: faculty ? faculty.trim() : 'JEE Faculty',
      topic: topic ? topic.trim() : undefined,
      description: description ? description.trim() : undefined,
      youtube_url,
      youtube_id,
      start_at: new Date(start_at).toISOString(),
      duration_min: Number(duration_min),
      is_embeddable: embedResult.isEmbeddable,
      thumbnail_url: embedResult.thumbnailUrl || `https://img.youtube.com/vi/${youtube_id}/hqdefault.jpg`,
    });

    return NextResponse.json({ class: newClass }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
