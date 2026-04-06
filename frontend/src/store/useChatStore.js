import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";

export const useChatStore = create((set, get) => ({
  allContacts: [],
  chats: [],
  messages: [],
  activeTab: "chats",
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,
  isSoundEnabled: JSON.parse(localStorage.getItem("isSoundEnabled")) === true,

  toggleSound: () => {
    localStorage.setItem("isSoundEnabled", !get().isSoundEnabled);
    set({ isSoundEnabled: !get().isSoundEnabled });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedUser: (selectedUser) => set({ selectedUser }),

  getAllContacts: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/contacts");
      set({ allContacts: res.data });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isUsersLoading: false });
    }
  },
  getMyChatPartners: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/chats");
      set({ chats: res.data });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessagesByUserId: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      set({ messages: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Something went wrong");
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    const { authUser } = useAuthStore.getState();

    const tempId = `temp-${Date.now()}`;

    const optimisticMessage = {
      _id: tempId,
      senderId: authUser._id,
      receiverId: selectedUser._id,
      text: messageData.text,
      image: messageData.image,
      createdAt: new Date().toISOString(),
      isOptimistic: true, // flag to identify optimistic messages (optional)
    };
    // immidetaly update the ui by adding the message
    set({ messages: [...messages, optimisticMessage] });

    try {
      const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);
      set({ messages: messages.concat(res.data) });
    } catch (error) {
      // remove optimistic message on failure
      set({ messages: messages });
      toast.error(error.response?.data?.message || "Something went wrong");
    }
  },

  deleteMessage: async (messageId, scope = "me") => {
    const { messages } = get();
    try {
      await axiosInstance.delete(`/messages/${messageId}`, { data: { scope } });

      if (scope === "me") {
        set({ messages: messages.filter((msg) => msg._id !== messageId) });
        return;
      }

      set({
        messages: messages.map((msg) =>
          msg._id === messageId
            ? {
                ...msg,
                text: "",
                image: "",
                isDeletedForEveryone: true,
                deletedForEveryoneAt: new Date().toISOString(),
                isPinned: false,
                pinnedBy: null,
                pinnedAt: null,
              }
            : msg
        ),
      });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete message");
    }
  },

  togglePinMessage: async (messageId, isPinned) => {
    const { messages } = get();
    try {
      const res = await axiosInstance.patch(`/messages/${messageId}/pin`, { isPinned });
      const updated = res.data;

      set({
        messages: messages.map((msg) => (msg._id === messageId ? { ...msg, ...updated } : msg)),
      });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to pin message");
    }
  },

  subscribeToMessages: () => {
    const { selectedUser, isSoundEnabled } = get();
    if (!selectedUser) return;

    const socket = useAuthStore.getState().socket;

    socket.on("newMessage", (newMessage) => {
      const isMessageSentFromSelectedUser = newMessage.senderId === selectedUser._id;
      if (!isMessageSentFromSelectedUser) return;

      const currentMessages = get().messages;
      set({ messages: [...currentMessages, newMessage] });

      if (isSoundEnabled) {
        const notificationSound = new Audio("/sounds/notification.mp3");

        notificationSound.currentTime = 0; // reset to start
        notificationSound.play().catch((e) => console.log("Audio play failed:", e));
      }
    });

    socket.on("messageDeleted", (payload) => {
      const currentMessages = get().messages;

      if (payload.scope === "me") {
        set({
          messages: currentMessages.filter((msg) => msg._id !== payload._id),
        });
        return;
      }

      set({
        messages: currentMessages.map((msg) =>
          msg._id === payload._id
            ? {
                ...msg,
                text: "",
                image: "",
                isDeletedForEveryone: true,
                deletedForEveryoneAt: payload.deletedForEveryoneAt,
                isPinned: false,
                pinnedBy: null,
                pinnedAt: null,
              }
            : msg
        ),
      });
    });

    socket.on("messagePinned", (payload) => {
      const currentMessages = get().messages;
      set({
        messages: currentMessages.map((msg) =>
          msg._id === payload._id ? { ...msg, ...payload } : msg
        ),
      });
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    socket.off("newMessage");
    socket.off("messageDeleted");
    socket.off("messagePinned");
  },
}));
