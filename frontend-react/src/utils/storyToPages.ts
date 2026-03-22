import type { StorySection } from '../hooks/useStoryteller';

export interface BookPage {
  id: string;
  sections: StorySection[];
  wordCount: number;
  pageNumber: number;
}

const WORDS_PER_PAGE = 250;

/**
 * Convert story sections into paginated book pages
 * Smart pagination: images get their own page, text flows naturally
 */
export function paginate(sections: StorySection[]): BookPage[] {
  const pages: BookPage[] = [];
  let currentPage: StorySection[] = [];
  let wordCount = 0;
  let pageNumber = 1;

  for (const section of sections) {
    // Images always get their own page
    if (section.type === 'image') {
      // Push current page if it has content
      if (currentPage.length > 0) {
        pages.push({
          id: `page-${pages.length}`,
          sections: currentPage,
          wordCount,
          pageNumber: pageNumber++,
        });
        currentPage = [];
        wordCount = 0;
      }

      // Image goes on its own page
      pages.push({
        id: `page-${pages.length}`,
        sections: [section],
        wordCount: 0,
        pageNumber: pageNumber++,
      });
      continue;
    }

    // Music badges stay with text
    if (section.type === 'music') {
      currentPage.push(section);
      continue;
    }

    // Text sections: count words and break if needed
    if (section.type === 'text') {
      const words = section.content.split(/\s+/).length;

      // If adding this section exceeds word limit and page has content, break
      if (wordCount + words > WORDS_PER_PAGE && currentPage.length > 0) {
        pages.push({
          id: `page-${pages.length}`,
          sections: currentPage,
          wordCount,
          pageNumber: pageNumber++,
        });
        currentPage = [section];
        wordCount = words;
      } else {
        currentPage.push(section);
        wordCount += words;
      }
    }
  }

  // Add remaining content
  if (currentPage.length > 0) {
    pages.push({
      id: `page-${pages.length}`,
      sections: currentPage,
      wordCount,
      pageNumber: pageNumber,
    });
  }

  return pages;
}

/**
 * Get text content from a page for voice narration
 * Skips images and music
 */
export function getPageTextForNarration(sections: StorySection[]): string {
  return sections
    .filter(s => s.type === 'text')
    .map(s => (s as any).content)
    .join(' ');
}
