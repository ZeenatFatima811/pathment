'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCheck, SmilePlus } from 'lucide-react';

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import type { ChatMessage } from '@/lib/types/messaging';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const LONG_PRESS_MS = 420;

interface MessageItemProps {
  message: ChatMessage;
  isMine: boolean;
  startsRun: boolean;
  currentUserId?: string;
  onReact: (messageId: string, emoji: string) => void | Promise<void>;
}

/**
 * Parses raw text to automatically render URLs as clickable links
 * and simple markdown (`**bold**`, `*italic*`, `` `code` ``).
 */
function FormattedMessageText({ text }: { text: string }) {
  const parts = useMemo(() => {
    // Regex for matching URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const splitByUrl = text.split(urlRegex);

    return splitByUrl.map((segment, idx) => {
      if (urlRegex.test(segment)) {
        return (
          <a
            key={idx}
            href={segment}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80 transition-opacity break-all font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {segment}
          </a>
        );
      }

      // Simple Markdown parser for bold, italic, code
      const tokens = segment.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);

      return (
        <Fragment key={idx}>
          {tokens.map((token, tokenIdx) => {
            if (
              token.startsWith('**') &&
              token.endsWith('**') &&
              token.length > 4
            ) {
              return (
                <strong key={tokenIdx} className="font-semibold">
                  {token.slice(2, -2)}
                </strong>
              );
            }
            if (
              token.startsWith('*') &&
              token.endsWith('*') &&
              token.length > 2
            ) {
              return (
                <em key={tokenIdx} className="italic">
                  {token.slice(1, -1)}
                </em>
              );
            }
            if (
              token.startsWith('`') &&
              token.endsWith('`') &&
              token.length > 2
            ) {
              return (
                <code
                  key={tokenIdx}
                  className="rounded bg-black/10 dark:bg-white/15 px-1 py-0.5 font-mono text-xs"
                >
                  {token.slice(1, -1)}
                </code>
              );
            }
            return token;
          })}
        </Fragment>
      );
    });
  }, [text]);

  return <p className="text-sm whitespace-pre-wrap leading-relaxed">{parts}</p>;
}

export default function MessageItem({
  message,
  isMine,
  startsRun,
  currentUserId,
  onReact,
}: MessageItemProps) {
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [reacting, setReacting] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  // null until first paint history load should not pop; only newly added chips do.
  const seenReactionEmojis = useRef<Set<string> | null>(null);
  const isTemp = message.id.startsWith('temp-');
  const canReact = !isTemp && !reacting;

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  useEffect(() => () => clearLongPress(), []);

  const openReactions = () => {
    if (!canReact) return;
    setReactionsOpen(true);
  };

  const react = async (emoji: string) => {
    if (!canReact) return;
    setReacting(true);
    setReactionsOpen(false);
    try {
      await onReact(message.id, emoji);
    } finally {
      setReacting(false);
    }
  };

  // Group reactions by emoji
  const groupedReactions = useMemo(() => {
    return (message.reactions || []).reduce(
      (acc, reaction) => {
        let entry = acc.find((item) => item.emoji === reaction.emoji);
        if (!entry) {
          entry = { emoji: reaction.emoji, count: 0, mine: false };
          acc.push(entry);
        }
        entry.count += 1;
        if (reaction.userId === currentUserId) {
          entry.mine = true;
        }
        return acc;
      },
      [] as { emoji: string; count: number; mine: boolean }[],
    );
  }, [message.reactions, currentUserId]);

  const hasReactions = groupedReactions.length > 0;

  useEffect(() => {
    const next = new Set(groupedReactions.map((g) => g.emoji));
    if (seenReactionEmojis.current === null) {
      seenReactionEmojis.current = next;
      return;
    }
    for (const emoji of next) seenReactionEmojis.current.add(emoji);
  }, [groupedReactions]);

  // After first paint, new/updated chips may pop; history load stays still.
  const canPopReaction = seenReactionEmojis.current !== null;

  // Dynamic border radii for WhatsApp-style message grouping
  const bubbleCornersClass = isMine
    ? startsRun
      ? 'rounded-2xl rounded-tr-sm'
      : 'rounded-2xl rounded-mr-sm'
    : startsRun
      ? 'rounded-2xl rounded-tl-sm'
      : 'rounded-2xl rounded-ml-sm';

  // Stack spacing: reacted messages keep room so the next bubble slides down
  const stackSpacingClass = [
    startsRun ? 'mt-3' : 'mt-1',
    hasReactions ? 'mb-2' : '',
    'transition-[margin] duration-200 ease-out',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} ${stackSpacingClass}`}
    >
      <Popover open={reactionsOpen} onOpenChange={setReactionsOpen}>
        {/* Side padding = hover bridge to the smile button (avoids a dead gap). */}
        <div
          className={`group/msg relative max-w-[85%] sm:max-w-[75%] ${
            canReact ? (isMine ? 'pl-11' : 'pr-11') : ''
          }`}
        >
          <PopoverAnchor asChild>
            <div
              className={`relative px-4 py-2.5 shadow-xs select-none ${bubbleCornersClass} ${
                isMine
                  ? 'bg-brand-600 text-white shadow-brand-600/10'
                  : 'bg-card border border-border text-foreground'
              } ${isTemp ? 'opacity-70 animate-pulse' : ''}`}
              onContextMenu={(e) => {
                if (!canReact) return;
                e.preventDefault();
                openReactions();
              }}
              onTouchStart={() => {
                if (!canReact) return;
                longPressFired.current = false;
                clearLongPress();
                longPressTimer.current = setTimeout(() => {
                  longPressFired.current = true;
                  openReactions();
                }, LONG_PRESS_MS);
              }}
              onTouchEnd={clearLongPress}
              onTouchCancel={clearLongPress}
              onTouchMove={clearLongPress}
              onClick={() => {
                // Swallow the click that follows a long-press open
                if (longPressFired.current) longPressFired.current = false;
              }}
            >
              {startsRun && !isMine && (
                <p className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 mb-0.5">
                  {`${message.sender?.firstName || ''} ${message.sender?.lastName || ''}`.trim() ||
                    'User'}
                </p>
              )}

              <FormattedMessageText text={message.messageText} />

              <div
                className={`flex items-center gap-1.5 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}
              >
                <span
                  className={`text-[10px] ${isMine ? 'text-white/70' : 'text-muted-foreground'}`}
                >
                  {new Date(message.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>

                {isMine &&
                  (() => {
                    const isRead = Boolean(message.isRead || message.readAt);
                    const isDelivered = Boolean(message.deliveredAt);

                    if (isTemp) {
                      return (
                        <span className="inline-flex" title="Sending...">
                          <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin self-center" />
                        </span>
                      );
                    }

                    if (isRead) {
                      return (
                        <span className="inline-flex" title="Seen">
                          <CheckCheck
                            className="w-3.5 h-3.5 text-sky-300"
                            aria-label="Seen"
                          />
                        </span>
                      );
                    }

                    if (isDelivered) {
                      return (
                        <span className="inline-flex" title="Delivered">
                          <CheckCheck
                            className="w-3.5 h-3.5 text-white/70"
                            aria-label="Delivered"
                          />
                        </span>
                      );
                    }

                    return (
                      <span className="inline-flex" title="Sent">
                        <Check
                          className="w-3.5 h-3.5 text-white/60"
                          aria-label="Sent"
                        />
                      </span>
                    );
                  })()}
              </div>
            </div>
          </PopoverAnchor>

          {/* Hover smile - desktop shortcut into the picker */}
          {canReact && (
            <button
              type="button"
              aria-label="Add reaction"
              aria-expanded={reactionsOpen}
              onClick={(e) => {
                e.stopPropagation();
                openReactions();
              }}
              className={`absolute top-1/2 z-[1] -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm opacity-0 transition-opacity duration-150 motion-reduce:transition-none group-hover/msg:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand-500 ${
                isMine ? 'left-0' : 'right-0'
              } ${reactionsOpen ? 'opacity-100' : ''}`}
            >
              <SmilePlus className="h-4 w-4" />
            </button>
          )}

          {/* Reaction chips - hug the bubble edge, still in-flow so the next message shifts down */}
          {hasReactions && (
            <div
              className={`relative z-[2] -mt-2.5 flex max-w-full flex-wrap gap-0.5 pt-0.5 ${
                isMine ? 'justify-end pr-1' : 'justify-start pl-1'
              }`}
            >
              {groupedReactions.map((entry) => (
                <button
                  key={`${entry.emoji}-${entry.count}`}
                  type="button"
                  disabled={!canReact}
                  onClick={(e) => {
                    e.stopPropagation();
                    void react(entry.emoji);
                  }}
                  aria-pressed={entry.mine}
                  aria-label={`${entry.emoji}, ${entry.count} reactions${entry.mine ? ', including you' : ''}`}
                  title={
                    entry.mine
                      ? 'You reacted - click to remove'
                      : 'Click to react'
                  }
                  className={`inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full border text-[13px] shadow-md backdrop-blur-sm transition-[transform,background-color,box-shadow,opacity] duration-150 ease-out hover:scale-105 active:scale-95 ${
                    canPopReaction ? 'animate-msg-reaction-pop' : ''
                  } ${
                    entry.count > 1 ? 'px-1.5' : 'px-0'
                  } ${
                    entry.mine
                      ? 'border-emerald-500/55 bg-emerald-500/20 text-foreground ring-1 ring-emerald-500/30'
                      : 'border-border/80 bg-card/95 text-foreground hover:bg-muted'
                  } ${reacting ? 'opacity-60' : ''}`}
                >
                  <span className="leading-none drop-shadow-sm">{entry.emoji}</span>
                  {entry.count > 1 && (
                    <span className="text-[11px] font-semibold tabular-nums leading-none text-muted-foreground">
                      {entry.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <PopoverContent
            side="top"
            align={isMine ? 'end' : 'start'}
            sideOffset={10}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="w-auto max-w-[calc(100vw-2rem)] rounded-full border border-border/80 bg-card/95 p-1.5 shadow-lg backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-90 data-[state=open]:slide-in-from-bottom-2 data-[state=open]:duration-200 motion-reduce:data-[state=open]:animate-none"
            aria-label="Choose a reaction"
          >
            <div className="flex items-center gap-0.5">
              {QUICK_REACTIONS.map((emoji, i) => {
                const mine = groupedReactions.some(
                  (g) => g.emoji === emoji && g.mine,
                );
                return (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={`React with ${emoji}`}
                    aria-pressed={mine}
                    disabled={reacting}
                    onClick={() => {
                      void react(emoji);
                    }}
                    style={{ animationDelay: `${i * 28}ms` }}
                    className={`flex h-11 w-11 items-center justify-center rounded-full text-[1.45rem] leading-none transition-transform duration-200 ease-out motion-reduce:transition-none hover:scale-125 hover:bg-muted/80 active:scale-110 focus-visible:outline-2 focus-visible:outline-brand-500 animate-in fade-in zoom-in-75 duration-200 fill-mode-both motion-reduce:animate-none ${
                      mine ? 'bg-muted scale-110 ring-1 ring-brand-500/30' : ''
                    }`}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </div>
      </Popover>
    </div>
  );
}
