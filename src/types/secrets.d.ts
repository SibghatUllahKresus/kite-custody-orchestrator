declare module 'secrets.js-grempe' {
  export function share(secret: string, shares: number, threshold: number): string[];
  export function combine(shares: string[]): string;
}
