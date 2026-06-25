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
  const hasInitializedScrollPositionRef = useRef(false);
  const initialItemIndex = Math.max(
    0,
    items.findIndex((item) => item.id === activeItemId)
  );
  const [activeIndex, setActiveIndex] = useState(initialItemIndex);
  const [feedHeight, setFeedHeight] = useState(0);
  const visibleIndex = clampIndex(activeIndex, items.length);
  const contentHeight =
    feedHeight > 0 ? `${items.length * feedHeight}px` : "100dvh";
  const virtualItems = useMemo(() => {
    const startIndex =
      feedHeight > 0
        ? clampIndex(visibleIndex - VIRTUAL_WINDOW_RADIUS, items.length)
        : visibleIndex;
    const endIndex =
      feedHeight > 0
        ? clampIndex(visibleIndex + VIRTUAL_WINDOW_RADIUS, items.length)
        : visibleIndex;

    return items
      .slice(startIndex, endIndex + 1)
      .map((item, offset) => ({ index: startIndex + offset, item }));
  }, [feedHeight, items, visibleIndex]);
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

    setActiveItemIndex(Math.round(feed.scrollTop / feedHeight));
  }, [feedHeight, setActiveItemIndex]);

  useEffect(() => {
    const feed = feedRef.current;

    if (!feed) {
      return;
    }

    const updateFeedHeight = () => {
      const nextFeedHeight = feed.getBoundingClientRect().height;
      setFeedHeight((currentHeight) =>
        currentHeight === nextFeedHeight ? currentHeight : nextFeedHeight
      );
    };
    const resizeObserver = new ResizeObserver(updateFeedHeight);
    const frameId = window.requestAnimationFrame(updateFeedHeight);

    resizeObserver.observe(feed);

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
    const feed = feedRef.current;

    if (
      !feed ||
      feedHeight <= 0 ||
      hasInitializedScrollPositionRef.current
    ) {
      return;
    }

    hasInitializedScrollPositionRef.current = true;
    feed.scrollTop = initialItemIndex * feedHeight;
  }, [feedHeight, initialItemIndex]);

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
              {renderItem(item, { isActive: index === visibleIndex })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
