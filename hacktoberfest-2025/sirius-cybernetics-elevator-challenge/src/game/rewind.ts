import { Message } from "@/types";

// Update the helper function to find the start of the Marvin join interaction
export const findMarvinJoinStartIndex = (messages: Message[]): number => {
  const marvinJoinIndex = messages.findIndex(msg => msg.persona === 'marvin' && msg.action === 'join'
  );

  if (marvinJoinIndex === -1) return -1;

  // Find the user message that triggered this interaction
  for (let i = marvinJoinIndex - 1; i >= 0; i--) {
    if (messages[i].persona === 'user') {
      return i;
    }
  }

  return marvinJoinIndex;
};
// Helper function to gradually remove messages
export const rewindMessages = (
  messages: Message[],
  targetIndex: number,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
) => {
  let currentIndex = messages.length;

  const removeMessage = () => {
    if (currentIndex > targetIndex) {
      currentIndex--;
      setMessages(messages.slice(0, currentIndex));
      setTimeout(removeMessage, 300);
    }
  };

  removeMessage();
};
