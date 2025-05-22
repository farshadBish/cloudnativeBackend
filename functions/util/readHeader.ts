import { HttpRequest } from '@azure/functions';

export function readHeader(request: HttpRequest, key: string): string {
    return Object.fromEntries(request.headers.entries())[key];
}
