declare module 'next' {
  export interface Metadata {
    title?: string;
    description?: string;
    [key: string]: any;
  }
}

declare module 'next/server' {
  export class NextResponse extends Response {
    static json(body: any, init?: ResponseInit): NextResponse;
    static redirect(url: string | URL, status?: number): NextResponse;
  }
}

declare module 'next/dynamic' {
  export default function dynamic<P = {}>(
    loader: () => Promise<React.ComponentType<P> | { default: React.ComponentType<P> }>,
    options?: { ssr?: boolean; loading?: () => React.ReactElement | null }
  ): React.ComponentType<P>;
}
