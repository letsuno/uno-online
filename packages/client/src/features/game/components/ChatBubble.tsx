import { motion, AnimatePresence } from 'framer-motion';

const EMOJI_ONLY_RE = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}‍️\s]+$/u;

interface ChatBubbleProps {
  message: string;
  visible: boolean;
}

export default function ChatBubble({ message, visible }: ChatBubbleProps) {
  const isEmojiOnly = EMOJI_ONLY_RE.test(message);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute bottom-full left-1/2 mb-2 pointer-events-none"
          style={{ transform: 'translateX(-50%)' }}
          initial={{ opacity: 0, scale: 0.6, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 4 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <div className="relative bg-white/15 backdrop-blur-sm rounded-xl px-3 py-1.5 w-max max-w-56">
            <span
              className={
                isEmojiOnly
                  ? 'text-xl leading-tight'
                  : 'text-xs leading-tight line-clamp-2 text-foreground'
              }
            >
              {message}
            </span>
            {/* Triangle pointer */}
            <div
              className="absolute left-1/2 -bottom-1.5"
              style={{
                marginLeft: -5,
                width: 0,
                height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: '6px solid rgba(255, 255, 255, 0.15)',
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
