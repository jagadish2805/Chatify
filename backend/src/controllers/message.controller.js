import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import Message from "../models/Message.js";
import User from "../models/User.js";

export const getAllContacts = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const filteredUsers = await User.find({ _id: { $ne: loggedInUserId } }).select("-password");

    res.status(200).json(filteredUsers);
  } catch (error) {
    console.log("Error in getAllContacts:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getMessagesByUserId = async (req, res) => {
  try {
    const myId = req.user._id;
    const { id: userToChatId } = req.params;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
      deletedFor: { $ne: myId },
    });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    if (!text && !image) {
      return res.status(400).json({ message: "Text or image is required." });
    }
    if (senderId.equals(receiverId)) {
      return res.status(400).json({ message: "Cannot send messages to yourself." });
    }
    const receiverExists = await User.exists({ _id: receiverId });
    if (!receiverExists) {
      return res.status(404).json({ message: "Receiver not found." });
    }

    let imageUrl;
    if (image) {
      // Try Cloudinary first; fall back to data URL in local/dev when credentials are not valid.
      try {
        const uploadResponse = await cloudinary.uploader.upload(image);
        imageUrl = uploadResponse.secure_url;
      } catch (uploadError) {
        if (typeof image === "string" && image.startsWith("data:image/")) {
          imageUrl = image;
        } else {
          console.log("Error in cloudinary upload:", uploadError.message);
          return res.status(400).json({ message: "Invalid image payload" });
        }
      }
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
    });

    await newMessage.save();

    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const messageId = req.params.id;
    const { scope } = req.body;
    const currentUserId = req.user._id;

    if (!scope || !["me", "everyone"].includes(scope)) {
      return res.status(400).json({ message: "scope must be 'me' or 'everyone'" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    const isParticipant =
      message.senderId.equals(currentUserId) || message.receiverId.equals(currentUserId);
    if (!isParticipant) {
      return res.status(403).json({ message: "Not allowed to modify this message" });
    }

    if (scope === "everyone") {
      if (!message.senderId.equals(currentUserId)) {
        return res.status(403).json({ message: "Only sender can delete for everyone" });
      }

      message.isDeletedForEveryone = true;
      message.deletedForEveryoneAt = new Date();
      message.text = "";
      message.image = "";
      message.isPinned = false;
      message.pinnedBy = null;
      message.pinnedAt = null;
      await message.save();

      const payload = {
        _id: message._id,
        senderId: message.senderId,
        receiverId: message.receiverId,
        isDeletedForEveryone: message.isDeletedForEveryone,
        deletedForEveryoneAt: message.deletedForEveryoneAt,
        isPinned: false,
        pinnedBy: null,
        pinnedAt: null,
      };

      const senderSocketId = getReceiverSocketId(message.senderId.toString());
      const receiverSocketId = getReceiverSocketId(message.receiverId.toString());
      if (senderSocketId) io.to(senderSocketId).emit("messageDeleted", payload);
      if (receiverSocketId) io.to(receiverSocketId).emit("messageDeleted", payload);

      return res.status(200).json(payload);
    }

    if (!message.deletedFor.some((id) => id.equals(currentUserId))) {
      message.deletedFor.push(currentUserId);
      await message.save();
    }

    const payload = { _id: message._id, scope: "me", userId: currentUserId };
    const currentUserSocketId = getReceiverSocketId(currentUserId.toString());
    if (currentUserSocketId) io.to(currentUserSocketId).emit("messageDeleted", payload);
    return res.status(200).json(payload);
  } catch (error) {
    console.log("Error in deleteMessage controller:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const togglePinMessage = async (req, res) => {
  try {
    const messageId = req.params.id;
    const currentUserId = req.user._id;
    const { isPinned } = req.body;

    if (typeof isPinned !== "boolean") {
      return res.status(400).json({ message: "isPinned must be a boolean" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    const isParticipant =
      message.senderId.equals(currentUserId) || message.receiverId.equals(currentUserId);
    if (!isParticipant) {
      return res.status(403).json({ message: "Not allowed to pin this message" });
    }
    if (message.isDeletedForEveryone) {
      return res.status(400).json({ message: "Cannot pin deleted message" });
    }

    message.isPinned = isPinned;
    message.pinnedBy = isPinned ? currentUserId : null;
    message.pinnedAt = isPinned ? new Date() : null;
    await message.save();

    const payload = {
      _id: message._id,
      isPinned: message.isPinned,
      pinnedBy: message.pinnedBy,
      pinnedAt: message.pinnedAt,
    };

    const senderSocketId = getReceiverSocketId(message.senderId.toString());
    const receiverSocketId = getReceiverSocketId(message.receiverId.toString());
    if (senderSocketId) io.to(senderSocketId).emit("messagePinned", payload);
    if (receiverSocketId) io.to(receiverSocketId).emit("messagePinned", payload);

    return res.status(200).json(payload);
  } catch (error) {
    console.log("Error in togglePinMessage controller:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getChatPartners = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    // find all the messages where the logged-in user is either sender or receiver
    const messages = await Message.find({
      $or: [{ senderId: loggedInUserId }, { receiverId: loggedInUserId }],
    });

    const chatPartnerIds = [
      ...new Set(
        messages.map((msg) =>
          msg.senderId.toString() === loggedInUserId.toString()
            ? msg.receiverId.toString()
            : msg.senderId.toString()
        )
      ),
    ];

    const chatPartners = await User.find({ _id: { $in: chatPartnerIds } }).select("-password");

    res.status(200).json(chatPartners);
  } catch (error) {
    console.error("Error in getChatPartners: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
