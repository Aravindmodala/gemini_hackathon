import { useState, useCallback, useRef } from 'react';

export type BookStateType = 'closed' | 'opening' | 'open' | 'flipping-next' | 'flipping-prev' | 'closing';

const OPEN_DURATION = 1500;
const CLOSE_DURATION = 1200;
const FLIP_DURATION = 700;

export function useBookState() {
  const [bookState, setBookState] = useState<BookStateType>('closed');
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const openBook = useCallback(() => {
    if (bookState !== 'closed') return;
    clearTimer();
    setBookState('opening');
    timerRef.current = setTimeout(() => setBookState('open'), OPEN_DURATION);
  }, [bookState]);

  const closeBook = useCallback(() => {
    if (bookState !== 'open') return;
    clearTimer();
    setBookState('closing');
    timerRef.current = setTimeout(() => {
      setBookState('closed');
      setCurrentPageIdx(0);
    }, CLOSE_DURATION);
  }, [bookState]);

  const goNext = useCallback((totalPages: number) => {
    if (bookState !== 'open' || currentPageIdx >= totalPages - 1) return;
    clearTimer();
    setBookState('flipping-next');
    timerRef.current = setTimeout(() => {
      setCurrentPageIdx(i => i + 1);
      setBookState('open');
    }, FLIP_DURATION);
  }, [bookState, currentPageIdx]);

  const goPrev = useCallback(() => {
    if (bookState !== 'open' || currentPageIdx <= 0) return;
    clearTimer();
    setBookState('flipping-prev');
    timerRef.current = setTimeout(() => {
      setCurrentPageIdx(i => i - 1);
      setBookState('open');
    }, FLIP_DURATION);
  }, [bookState, currentPageIdx]);

  const isOpen = bookState === 'open' || bookState === 'flipping-next' || bookState === 'flipping-prev';
  const isOpening = bookState === 'opening';
  const isClosing = bookState === 'closing';
  const isClosed = bookState === 'closed';
  const isFlippingNext = bookState === 'flipping-next';
  const isFlippingPrev = bookState === 'flipping-prev';
  const isFlipping = isFlippingNext || isFlippingPrev;

  return {
    bookState,
    currentPageIdx,
    openBook,
    closeBook,
    goNext,
    goPrev,
    isOpen,
    isOpening,
    isClosing,
    isClosed,
    isFlipping,
    isFlippingNext,
    isFlippingPrev,
  };
}
