import { useEffect, useRef } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import ChatHeader from "./ChatHeader";
import NoChatHistoryPlaceholder from "./NoChatHistoryPlaceholder";
import MessageInput from "./MessageInput";
import MessagesLoadingSkeleton from "./MessagesLoadingSkeleton";
import { PinIcon, PinOffIcon, Trash2Icon } from "lucide-react";

function ChatContainer() {
  const {
    selectedUser,
    getMessagesByUserId,
    messages,
    isMessagesLoading,
    subscribeToMessages,
    unsubscribeFromMessages,
    deleteMessage,
    togglePinMessage,
  } = useChatStore();
  const { authUser } = useAuthStore();
  const messageEndRef = useRef(null);
  const pinnedMessages = messages.filter((msg) => msg.isPinned && !msg.isDeletedForEveryone);

  useEffect(() => {
    getMessagesByUserId(selectedUser._id);
    subscribeToMessages();

    // clean up
    return () => unsubscribeFromMessages();
  }, [selectedUser, getMessagesByUserId, subscribeToMessages, unsubscribeFromMessages]);

  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  return (
    <>
      <ChatHeader />
      <div className="flex-1 px-6 overflow-y-auto py-8">
        {messages.length > 0 && !isMessagesLoading ? (
          <div className="max-w-3xl mx-auto space-y-6">
            {pinnedMessages.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <p className="text-xs text-amber-300 mb-2">Pinned messages</p>
                <div className="space-y-2">
                  {pinnedMessages.map((msg) => (
                    <div key={`pinned-${msg._id}`} className="text-sm text-slate-200 truncate">
                      {msg.text || "Pinned image"}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg._id}
                className={`chat group ${msg.senderId === authUser._id ? "chat-end" : "chat-start"}`}
              >
                <div
                  className={`chat-bubble relative ${
                    msg.senderId === authUser._id
                      ? "bg-cyan-600 text-white"
                      : "bg-slate-800 text-slate-200"
                  }`}
                >
                  {!msg.isDeletedForEveryone && (
                    <div className="absolute -top-8 right-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-slate-900/90 p-1 rounded-md">
                      <button
                        onClick={() => togglePinMessage(msg._id, !msg.isPinned)}
                        className="p-1.5 rounded hover:bg-slate-700"
                        title={msg.isPinned ? "Unpin message" : "Pin message"}
                      >
                        {msg.isPinned ? (
                          <PinOffIcon className="w-4 h-4 text-amber-300" />
                        ) : (
                          <PinIcon className="w-4 h-4 text-slate-200" />
                        )}
                      </button>
                      <button
                        onClick={() => deleteMessage(msg._id, "me")}
                        className="p-1.5 rounded hover:bg-slate-700"
                        title="Delete for me"
                      >
                        <Trash2Icon className="w-4 h-4 text-slate-200" />
                      </button>
                      {msg.senderId === authUser._id && (
                        <button
                          onClick={() => deleteMessage(msg._id, "everyone")}
                          className="text-xs px-2 py-1 rounded hover:bg-red-500/20 text-red-200"
                          title="Delete for everyone"
                        >
                          Everyone
                        </button>
                      )}
                    </div>
                  )}
                  {msg.isPinned && !msg.isDeletedForEveryone && (
                    <p className="text-xs mb-1 opacity-90 flex items-center gap-1">
                      <PinIcon className="w-3.5 h-3.5" /> Pinned
                    </p>
                  )}
                  {msg.isDeletedForEveryone ? (
                    <p className="italic opacity-80">This message was deleted for everyone.</p>
                  ) : (
                    <>
                      {msg.image && (
                        <img src={msg.image} alt="Shared" className="rounded-lg h-48 object-cover" />
                      )}
                      {msg.text && <p className="mt-2">{msg.text}</p>}
                    </>
                  )}
                  <p className="text-xs mt-1 opacity-75 flex items-center gap-1">
                    {new Date(msg.createdAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
            {/* 👇 scroll target */}
            <div ref={messageEndRef} />
          </div>
        ) : isMessagesLoading ? (
          <MessagesLoadingSkeleton />
        ) : (
          <NoChatHistoryPlaceholder name={selectedUser.fullName} />
        )}
      </div>

      <MessageInput />
    </>
  );
}

export default ChatContainer;
