export const BASE_URL = "https://memroos.com";
export const OG_IMAGE_URL = `${BASE_URL}/screenshots/memroos-og.png`;
export const SITE_NAME = "MemroOS";

export function makeTitle(pageTitle: string): string {
  return `${pageTitle} | ${SITE_NAME}`;
}

export function makeCanonical(path: string): string {
  return `${BASE_URL}${path}`;
}
