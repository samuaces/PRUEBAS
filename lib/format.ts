export function eur(cents: number): string {
  return (cents / 100).toLocaleString('en-IE', { style: 'currency', currency: 'EUR' });
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
