"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, ReactNode, TouchEvent } from "react";
import styles from "./virtual-carousel.module.css";

type DragPoint = {
  x: number;
  y: number;
};

export type VirtualCarouselItem = {
  id: string;
};

export type VirtualCarouselProps<TItem extends VirtualCarouselItem> = {
  items: TItem[];
  renderItem: (item: TItem, options: { isPriority: boolean }) => ReactNode;
};

const DRAG_AXIS_LOCK_RATIO = 1.2;
const CAROUSEL_TRANSITION_MS = 200;
const DRAG_DISTANCE_RATIO = 0.14;
const DRAG_EDGE_RESISTANCE = 0.18;
const MAX_SWIPE_THRESHOLD = 96;

const clampIndex = (index: number, length: number) =>
  length <= 0 ? 0 : Math.min(length - 1, Math.max(0, index));

export function VirtualCarousel<TItem extends VirtualCarouselItem>({
  items,
  renderItem,
}: VirtualCarouselProps<TItem>) {
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const transitionFrameRef = useRef<number | null>(null);
  const dragRef = useRef<DragPoint | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isTransitionDisabled, setIsTransitionDisabled] = useState(true);
  const visibleIndex = Math.min(activeIndex, Math.max(items.length - 1, 0));
  const contentWidth =
    carouselWidth > 0 ? `${items.length * carouselWidth}px` : "100%";
  const trackOffset = -(visibleIndex * carouselWidth) + dragOffset;
  const shouldDisableTransition = isDragging || isTransitionDisabled;
  const virtualItems = useMemo(
    () => {
      const startIndex =
        carouselWidth > 0
          ? clampIndex(visibleIndex - 1, items.length)
          : visibleIndex;
      const endIndex =
        carouselWidth > 0
          ? clampIndex(visibleIndex + 1, items.length)
          : visibleIndex;

      return items
        .slice(startIndex, endIndex + 1)
        .map((item, offset) => ({ index: startIndex + offset, item }));
    },
    [carouselWidth, items, visibleIndex]
  );
  const trackStyle = {
    transform: `translate3d(${trackOffset}px, 0, 0)`,
    transition: shouldDisableTransition ? "none" : undefined,
    width: contentWidth,
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
    const carousel = carouselRef.current;

    if (!carousel) {
      return;
    }

    const updateCarouselWidth = () => {
      const nextCarouselWidth = carousel.clientWidth;
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
      clearSettleTimer();
      clearTransitionFrame();
    };
  }, [clearSettleTimer, clearTransitionFrame]);

  useEffect(() => {
    if (carouselWidth > 0 && isTransitionDisabled) {
      enableTransitionNextFrame();
    }
  }, [carouselWidth, enableTransitionNextFrame, isTransitionDisabled]);

  function settleIndex(index: number, offset: number) {
    const nextIndex = clampIndex(index, items.length);

    if (nextIndex === visibleIndex) {
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
    }, CAROUSEL_TRANSITION_MS);
  }

  function move(step: number) {
    const nextIndex = visibleIndex + step;

    if (nextIndex < 0 || nextIndex >= items.length) {
      return;
    }

    if (carouselWidth <= 0) {
      setActiveIndex(nextIndex);
      return;
    }

    settleIndex(nextIndex, -step * carouselWidth);
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

    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      return;
    }

    const isDraggingBeforeFirstItem = visibleIndex === 0 && deltaX > 0;
    const isDraggingAfterLastItem =
      visibleIndex === items.length - 1 && deltaX < 0;

    setDragOffset(
      isDraggingBeforeFirstItem || isDraggingAfterLastItem
        ? deltaX * DRAG_EDGE_RESISTANCE
        : deltaX
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
      Math.abs(deltaX) >
        Math.min(carouselWidth * DRAG_DISTANCE_RATIO, MAX_SWIPE_THRESHOLD) &&
      Math.abs(deltaX) > Math.abs(deltaY) * DRAG_AXIS_LOCK_RATIO;

    if (shouldChangeItem) {
      const direction = deltaX < 0 ? 1 : -1;
      const nextIndex = visibleIndex + direction;

      if (nextIndex >= 0 && nextIndex < items.length) {
        settleIndex(nextIndex, -direction * carouselWidth);
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
    <>
      <div
        className={styles.viewport}
        onPointerCancel={cancelDrag}
        onPointerDown={handlePointerDown}
        onPointerLeave={cancelDrag}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onTouchMove={handleTouch}
        onTouchStart={handleTouch}
        ref={carouselRef}
      >
        <div className={styles.track} style={trackStyle}>
          {virtualItems.map(({ item, index }) => {
            const slideStyle = {
              left: carouselWidth > 0 ? `${index * carouselWidth}px` : "0",
              width: carouselWidth > 0 ? `${carouselWidth}px` : "100%",
            } satisfies CSSProperties;
            const isPriority = Math.abs(index - visibleIndex) <= 1;

            return (
              <div
                className={styles.slide}
                key={item.id}
                style={slideStyle}
              >
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
            disabled={visibleIndex === 0}
            onClick={() => move(-1)}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            aria-label="Next item"
            className={`${styles.button} ${styles.next}`}
            disabled={visibleIndex === items.length - 1}
            onClick={() => move(1)}
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
                  index === visibleIndex ? styles.dotActive : undefined
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
