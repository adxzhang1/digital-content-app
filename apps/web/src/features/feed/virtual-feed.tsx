"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, ReactNode, TouchEvent } from "react";
import styles from "./virtual-feed.module.css";

type DragPoint = {
  x: number;
  y: number;
};

export type VirtualFeedItem = {
  id: string;
};

export type VirtualFeedProps<TItem extends VirtualFeedItem> = {
  activeItemId: string;
  ariaLabel: string;
  items: TItem[];
  onActiveItemChange: (item: TItem) => void;
  renderItem: (item: TItem, options: { isActive: boolean }) => ReactNode;
};

const DRAG_AXIS_LOCK_RATIO = 1.2;
const FEED_TRANSITION_MS = 200;
const DRAG_DISTANCE_RATIO = 0.14;
const DRAG_EDGE_RESISTANCE = 0.18;
const MAX_SWIPE_THRESHOLD = 96;

const clampIndex = (index: number, length: number) =>
  length <= 0 ? 0 : Math.min(length - 1, Math.max(0, index));

export function VirtualFeed<TItem extends VirtualFeedItem>({
  activeItemId,
  ariaLabel,
  items,
  onActiveItemChange,
  renderItem,
}: VirtualFeedProps<TItem>) {
  const feedRef = useRef<HTMLDivElement | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const transitionFrameRef = useRef<number | null>(null);
  const dragRef = useRef<DragPoint | null>(null);
  const initialItemIndex = Math.max(
    0,
    items.findIndex((item) => item.id === activeItemId)
  );
  const [activeIndex, setActiveIndex] = useState(initialItemIndex);
  const [dragOffset, setDragOffset] = useState(0);
  const [feedHeight, setFeedHeight] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isTransitionDisabled, setIsTransitionDisabled] = useState(true);
  const visibleIndex = clampIndex(activeIndex, items.length);
  const contentHeight =
    feedHeight > 0 ? `${items.length * feedHeight}px` : "100dvh";
  const trackOffset = -(visibleIndex * feedHeight) + dragOffset;
  const shouldDisableTransition = isDragging || isTransitionDisabled;
  const virtualItems = useMemo(
    () => {
      const startIndex =
        feedHeight > 0
          ? clampIndex(visibleIndex - 1, items.length)
          : visibleIndex;
      const endIndex =
        feedHeight > 0
          ? clampIndex(visibleIndex + 1, items.length)
          : visibleIndex;

      return items
        .slice(startIndex, endIndex + 1)
        .map((item, offset) => ({ index: startIndex + offset, item }));
    },
    [feedHeight, items, visibleIndex]
  );
  const trackStyle = {
    height: contentHeight,
    transform: `translate3d(0, ${trackOffset}px, 0)`,
    transition: shouldDisableTransition ? "none" : undefined,
  } satisfies CSSProperties;

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const clearTransitionFrame = useCallback(() => {
    if (transitionFrameRef.current !== null) {
      window.cancelAnimationFrame(transitionFrameRef.current);
      transitionFrameRef.current = null;
    }
  }, []);

  const disableTransition = useCallback(() => {
    setIsTransitionDisabled(true);
  }, []);

  const enableTransitionNextFrame = useCallback(() => {
    clearTransitionFrame();

    transitionFrameRef.current = window.requestAnimationFrame(() => {
      setIsTransitionDisabled(false);
      setDragOffset(0);
      transitionFrameRef.current = null;
    });
  }, [clearTransitionFrame]);

  useEffect(() => {
    const feed = feedRef.current;

    if (!feed) {
      return;
    }

    const updateFeedHeight = () => {
      const nextFeedHeight = feed.clientHeight;
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
      clearSettleTimer();
      clearTransitionFrame();
    };
  }, [clearSettleTimer, clearTransitionFrame]);

  useEffect(() => {
    if (feedHeight > 0 && isTransitionDisabled) {
      enableTransitionNextFrame();
    }
  }, [enableTransitionNextFrame, feedHeight, isTransitionDisabled]);

  function settleIndex(index: number, offset: number) {
    const nextIndex = clampIndex(index, items.length);
    const nextItem = items[nextIndex];

    if (!nextItem || nextIndex === visibleIndex) {
      setDragOffset(0);
      return;
    }

    clearSettleTimer();
    setDragOffset(offset);

    settleTimerRef.current = window.setTimeout(() => {
      disableTransition();
      setActiveIndex(nextIndex);
      setDragOffset(0);
      settleTimerRef.current = null;
      enableTransitionNextFrame();

      if (nextItem.id !== activeItemId) {
        onActiveItemChange(nextItem);
      }
    }, FEED_TRANSITION_MS);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary) {
      return;
    }

    if (items.length < 2 || settleTimerRef.current !== null) {
      return;
    }

    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
    setIsDragging(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag) {
      return;
    }

    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      return;
    }

    const isDraggingBeforeFirstItem = visibleIndex === 0 && deltaY > 0;
    const isDraggingAfterLastItem =
      visibleIndex === items.length - 1 && deltaY < 0;

    setDragOffset(
      isDraggingBeforeFirstItem || isDraggingAfterLastItem
        ? deltaY * DRAG_EDGE_RESISTANCE
        : deltaY
    );
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary) {
      return;
    }

    const drag = dragRef.current;
    dragRef.current = null;
    setIsDragging(false);

    if (!drag) {
      return;
    }

    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    const shouldChangeItem =
      Math.abs(deltaY) >
        Math.min(feedHeight * DRAG_DISTANCE_RATIO, MAX_SWIPE_THRESHOLD) &&
      Math.abs(deltaY) > Math.abs(deltaX) * DRAG_AXIS_LOCK_RATIO;

    if (shouldChangeItem) {
      const direction = deltaY < 0 ? 1 : -1;
      const nextIndex = visibleIndex + direction;

      if (nextIndex >= 0 && nextIndex < items.length) {
        settleIndex(nextIndex, -direction * feedHeight);
      } else {
        setDragOffset(0);
      }
      return;
    }

    setDragOffset(0);
  }

  function cancelDrag() {
    if (dragRef.current) {
      dragRef.current = null;
      setIsDragging(false);
      setDragOffset(0);
    }
  }

  function handleTouch(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length > 1) {
      cancelDrag();
    }
  }

  return (
    <div
      aria-label={ariaLabel}
      className={styles.viewer}
      onPointerCancel={cancelDrag}
      onPointerDown={handlePointerDown}
      onPointerLeave={cancelDrag}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onTouchMove={handleTouch}
      onTouchStart={handleTouch}
      ref={feedRef}
    >
      <div className={styles.track} style={trackStyle}>
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
