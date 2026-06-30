"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import styles from "./scroll-snap-carousel.module.css";

export type ScrollSnapCarouselItem = {
  id: string;
};

export type ScrollSnapCarouselProps<TItem extends ScrollSnapCarouselItem> = {
  items: TItem[];
  renderItem: (item: TItem, options: { isPriority: boolean }) => ReactNode;
};

const VIRTUAL_WINDOW_RADIUS = 1;

const clampIndex = (index: number, length: number) =>
  length <= 0 ? 0 : Math.min(length - 1, Math.max(0, index));

export function ScrollSnapCarousel<TItem extends ScrollSnapCarouselItem>({
  items,
  renderItem,
}: ScrollSnapCarouselProps<TItem>) {
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const measuredCarouselWidthRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const clampedActiveIndex = clampIndex(activeIndex, items.length);
  const contentWidth =
    carouselWidth > 0 ? `${items.length * carouselWidth}px` : "100%";
  const virtualItems = useMemo(() => {
    const startIndex =
      carouselWidth > 0
        ? clampIndex(clampedActiveIndex - VIRTUAL_WINDOW_RADIUS, items.length)
        : clampedActiveIndex;
    const endIndex =
      carouselWidth > 0
        ? clampIndex(clampedActiveIndex + VIRTUAL_WINDOW_RADIUS, items.length)
        : clampedActiveIndex;

    return items
      .slice(startIndex, endIndex + 1)
      .map((item, offset) => ({ index: startIndex + offset, item }));
  }, [carouselWidth, clampedActiveIndex, items]);
  const snapItems = useMemo(
    () =>
      items.map((item) => {
        const snapItemStyle = {
          width: carouselWidth > 0 ? `${carouselWidth}px` : "100%",
        } satisfies CSSProperties;

        return (
          <div
            aria-hidden="true"
            className={styles.snapItem}
            key={item.id}
            style={snapItemStyle}
          />
        );
      }),
    [carouselWidth, items]
  );

  const clearScrollFrame = useCallback(() => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }, []);

  const updateActiveIndexFromScroll = useCallback(() => {
    const carousel = carouselRef.current;

    if (!carousel || carouselWidth <= 0) {
      return;
    }

    setActiveIndex(
      clampIndex(Math.round(carousel.scrollLeft / carouselWidth), items.length)
    );
  }, [carouselWidth, items.length]);

  useEffect(() => {
    const carousel = carouselRef.current;

    if (!carousel) {
      return;
    }

    const updateCarouselWidth = () => {
      const nextCarouselWidth = carousel.getBoundingClientRect().width;
      setCarouselWidth((currentWidth) =>
        currentWidth === nextCarouselWidth ? currentWidth : nextCarouselWidth
      );
    };
    const resizeObserver = new ResizeObserver(updateCarouselWidth);
    const frameId = window.requestAnimationFrame(updateCarouselWidth);

    resizeObserver.observe(carousel);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      clearScrollFrame();
    };
  }, [clearScrollFrame]);

  useLayoutEffect(() => {
    const carousel = carouselRef.current;

    if (!carousel || carouselWidth <= 0) {
      return;
    }

    if (measuredCarouselWidthRef.current === carouselWidth) {
      return;
    }

    measuredCarouselWidthRef.current = carouselWidth;
    carousel.scrollLeft = clampedActiveIndex * carouselWidth;
  }, [carouselWidth, clampedActiveIndex]);

  function handleScroll() {
    clearScrollFrame();

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      updateActiveIndexFromScroll();
    });
  }

  function scrollToIndex(index: number) {
    const carousel = carouselRef.current;

    if (!carousel || carouselWidth <= 0) {
      return;
    }

    carousel.scrollTo({
      left: clampIndex(index, items.length) * carouselWidth,
      behavior: "smooth",
    });
  }

  return (
    <>
      <div
        className={styles.viewer}
        onScroll={handleScroll}
        ref={carouselRef}
      >
        <div className={styles.snapTrack} style={{ width: contentWidth }}>
          {snapItems}
        </div>
        <div className={styles.virtualLayer} style={{ width: contentWidth }}>
          {virtualItems.map(({ item, index }) => {
            const slideStyle = {
              left: carouselWidth > 0 ? `${index * carouselWidth}px` : "0",
              width: carouselWidth > 0 ? `${carouselWidth}px` : "100%",
            } satisfies CSSProperties;
            const isPriority = Math.abs(index - clampedActiveIndex) <= 1;

            return (
              <div className={styles.item} key={item.id} style={slideStyle}>
                {renderItem(item, { isPriority })}
              </div>
            );
          })}
        </div>
      </div>
      {items.length > 1 ? (
        <>
          <button
            aria-label="Previous item"
            className={`${styles.button} ${styles.previous}`}
            disabled={clampedActiveIndex === 0}
            onClick={() => scrollToIndex(clampedActiveIndex - 1)}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            aria-label="Next item"
            className={`${styles.button} ${styles.next}`}
            disabled={clampedActiveIndex === items.length - 1}
            onClick={() => scrollToIndex(clampedActiveIndex + 1)}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
          <div className={styles.dots} aria-hidden="true">
            {items.map((item, index) => (
              <span
                className={
                  index === clampedActiveIndex ? styles.dotActive : undefined
                }
                key={item.id}
              />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
