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
import styles from "./scroll-snap-feed.module.css";

export type ScrollSnapFeedItem = {
  id: string;
};

export type ScrollSnapFeedProps<TItem extends ScrollSnapFeedItem> = {
  activeItemId: string;
  ariaLabel: string;
  items: TItem[];
  onActiveItemChange: (item: TItem) => void;
  renderItem: (item: TItem, options: { isActive: boolean }) => ReactNode;
};

const VIRTUAL_WINDOW_RADIUS = 1;

const clampIndex = (index: number, length: number) =>
  length <= 0 ? 0 : Math.min(length - 1, Math.max(0, index));

export function ScrollSnapFeed<TItem extends ScrollSnapFeedItem>({
  activeItemId,
  ariaLabel,
  items,
  onActiveItemChange,
  renderItem,
}: ScrollSnapFeedProps<TItem>) {
  const feedRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const feedHeightRef = useRef(0);
  const initialItemIndex = Math.max(
    0,
    items.findIndex((item) => item.id === activeItemId)
  );
  const clampedActiveIndexRef = useRef(initialItemIndex);
  const [activeIndex, setActiveIndex] = useState(initialItemIndex);
  const [feedHeight, setFeedHeight] = useState(0);
  const clampedActiveIndex = clampIndex(activeIndex, items.length);
  const contentHeight =
    feedHeight > 0 ? `${items.length * feedHeight}px` : "100dvh";
  const virtualItems = useMemo(() => {
    const startIndex =
      feedHeight > 0
        ? clampIndex(clampedActiveIndex - VIRTUAL_WINDOW_RADIUS, items.length)
        : clampedActiveIndex;
    const endIndex =
      feedHeight > 0
        ? clampIndex(clampedActiveIndex + VIRTUAL_WINDOW_RADIUS, items.length)
        : clampedActiveIndex;

    return items
      .slice(startIndex, endIndex + 1)
      .map((item, offset) => ({ index: startIndex + offset, item }));
  }, [clampedActiveIndex, feedHeight, items]);
  const snapItems = useMemo(
    () =>
      items.map((item) => (
        <div aria-hidden="true" className={styles.snapItem} key={item.id} />
      )),
    [items]
  );

  const clearScrollFrame = useCallback(() => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }, []);

  const setActiveItemIndex = useCallback(
    (index: number) => {
      const nextIndex = clampIndex(index, items.length);
      const nextItem = items[nextIndex];

      if (!nextItem) {
        return;
      }

      clampedActiveIndexRef.current = nextIndex;
      setActiveIndex((currentIndex) =>
        currentIndex === nextIndex ? currentIndex : nextIndex
      );

      if (nextItem.id !== activeItemId) {
        onActiveItemChange(nextItem);
      }
    },
    [activeItemId, items, onActiveItemChange]
  );

  const updateActiveIndexFromScroll = useCallback(() => {
    const feed = feedRef.current;

    if (!feed || feedHeight <= 0) {
      return;
    }

    if (Math.abs(feed.getBoundingClientRect().height - feedHeight) > 0.5) {
      return;
    }

    setActiveItemIndex(Math.round(feed.scrollTop / feedHeight));
  }, [feedHeight, setActiveItemIndex]);

  useEffect(() => {
    clampedActiveIndexRef.current = clampedActiveIndex;
  }, [clampedActiveIndex]);

  useLayoutEffect(() => {
    const feed = feedRef.current;

    if (!feed) {
      return;
    }

    const updateFeedHeight = () => {
      const nextFeedHeight = feed.getBoundingClientRect().height;

      if (feedHeightRef.current === nextFeedHeight) {
        return;
      }

      feedHeightRef.current = nextFeedHeight;
      clearScrollFrame();
      feed.scrollTop = clampedActiveIndexRef.current * nextFeedHeight;
      setFeedHeight(nextFeedHeight);
    };
    const resizeObserver = new ResizeObserver(updateFeedHeight);

    updateFeedHeight();
    resizeObserver.observe(feed);

    return () => {
      resizeObserver.disconnect();
    };
  }, [clearScrollFrame]);

  useEffect(() => {
    return () => {
      clearScrollFrame();
    };
  }, [clearScrollFrame]);

  function handleScroll() {
    clearScrollFrame();

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      updateActiveIndexFromScroll();
    });
  }

  return (
    <div
      aria-label={ariaLabel}
      className={styles.viewer}
      onScroll={handleScroll}
      ref={feedRef}
    >
      <div className={styles.snapTrack}>{snapItems}</div>
      <div className={styles.virtualLayer} style={{ height: contentHeight }}>
        {virtualItems.map(({ index, item }) => {
          const itemStyle = {
            top: feedHeight > 0 ? `${index * feedHeight}px` : "0",
          } satisfies CSSProperties;

          return (
            <div className={styles.item} key={item.id} style={itemStyle}>
              {renderItem(item, { isActive: index === clampedActiveIndex })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
