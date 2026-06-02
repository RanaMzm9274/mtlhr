import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Paperclip, Send, Check, CheckCheck, Search, MoreVertical, Phone, Video, Info, MessageCircle, Users, Bell, Settings, ChevronLeft, Trash2, Copy, ExternalLink, Mic, Square } from "lucide-react";

type UserSummary = { user_id: string; name: string; email: string; avatar_url: string | null; role?: string | null };
type ConversationRow = { id: string; last_message_at: string; peer: UserSummary | null; unread: number };
type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  created_at: string;
  read_by_others: number;
};
type ReactionMeta = { emoji: string; user_id: string; created_at: string };

const CHAT_BUCKET = "chat-attachments";

const avatarText = (value: string) => value.trim().charAt(0).toUpperCase() || "U";
const userById = (users: UserSummary[], userId?: string | null) => users.find((u) => u.user_id === userId) ?? null;
const titleForRole = (role?: string | null) => (role === "super_admin" ? "Super Admin" : role === "admin" ? "Admin" : "");
const displayNameWithTitle = (profile?: Pick<UserSummary, "name" | "email" | "role"> | null) => {
  if (!profile) return "Unknown user";
  const base = profile.name || profile.email || "User";
  const title = titleForRole(profile.role);
  return title ? `${title} ${base}` : base;
};

export default function MessagesPage() {
  const { user, companySlug, role } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [startChatOpen, setStartChatOpen] = useState(false);
  const [startChatSearch, setStartChatSearch] = useState("");
  const [leftRailTab, setLeftRailTab] = useState<"chats" | "contacts" | "alerts" | "settings">("chats");
  const [messageReactions, setMessageReactions] = useState<Record<string, Record<string, string[]>>>({});
  const [messageReactionMeta, setMessageReactionMeta] = useState<Record<string, ReactionMeta[]>>({});
  const [messageSeenAt, setMessageSeenAt] = useState<Record<string, string | null>>({});
  const [recording, setRecording] = useState(false);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  );

  const loadCompanyAndUsers = async (background = false) => {
    if (!user || !companySlug) return;
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const { data: company } = await supabase.from("companies").select("id").eq("slug", companySlug).maybeSingle();
      const nextCompanyId = company?.id ?? null;
      setCompanyId(nextCompanyId);
      if (!nextCompanyId) {
        setUsers([]);
        setConversations([]);
        return;
      }

      const { data: profiles } = await supabase
        .from("employee_profiles")
        .select("user_id,name,email,avatar_url")
        .eq("company_id", nextCompanyId);

      const mappedUsers = ((profiles as any[]) ?? [])
        .filter((profile) => !!profile.user_id)
        .map((profile) => ({
          user_id: profile.user_id as string,
          name: profile.name || profile.email || "User",
          email: profile.email || "",
          avatar_url: profile.avatar_url || null,
          role: null,
        }));

      const roleUserIds = mappedUsers.map((profile) => profile.user_id).filter(Boolean);
      const roleMap = new Map<string, string>();
      if (roleUserIds.length) {
        const { data: roleRows } = await supabase.from("user_roles").select("user_id,role").in("user_id", roleUserIds);
        ((roleRows as Array<{ user_id: string; role: string }>) ?? []).forEach((row) => {
          const prev = roleMap.get(row.user_id);
          if (prev === "super_admin") return;
          if (row.role === "super_admin") roleMap.set(row.user_id, "super_admin");
          else if (row.role === "admin" && prev !== "super_admin") roleMap.set(row.user_id, "admin");
          else if (!prev) roleMap.set(row.user_id, row.role);
        });
      }
      const mappedUsersWithRole = mappedUsers.map((profile) => ({ ...profile, role: roleMap.get(profile.user_id) ?? null }));

      const dedup = new Map<string, UserSummary>();
      mappedUsersWithRole.forEach((profile) => dedup.set(profile.user_id, profile));
      if (!dedup.has(user.id)) dedup.set(user.id, { user_id: user.id, name: user.email || "Me", email: user.email || "", avatar_url: null, role: role });
      const nextUsers = [...dedup.values()];
      setUsers(nextUsers);

      const { data: myParticipations } = await supabase.from("chat_participants").select("conversation_id").eq("user_id", user.id);
      const conversationIds = ((myParticipations as Array<{ conversation_id: string }>) ?? []).map((row) => row.conversation_id);
      if (!conversationIds.length) {
        setConversations([]);
        setActiveConversationId(null);
        setMessages([]);
        return;
      }

      const { data: conversationRows } = await supabase
        .from("chat_conversations")
        .select("id,last_message_at")
        .in("id", conversationIds)
        .order("last_message_at", { ascending: false });

      const { data: allParticipants } = await supabase
        .from("chat_participants")
        .select("conversation_id,user_id,last_read_at")
        .in("conversation_id", conversationIds);

      const participantUserIds = Array.from(
        new Set(((allParticipants as any[]) ?? []).map((row) => row.user_id).filter(Boolean)),
      ) as string[];
      let participantProfiles: any[] = [];
      if (participantUserIds.length) {
        const { data } = await supabase
          .from("employee_profiles")
          .select("user_id,name,email,avatar_url")
          .in("user_id", participantUserIds);
        participantProfiles = (data as any[]) ?? [];
      }

      const { data: unreadMessages } = await supabase
        .from("chat_messages")
        .select("id,conversation_id,sender_id,created_at")
        .in("conversation_id", conversationIds)
        .neq("sender_id", user.id);
      const { data: recentMessages } = await supabase
        .from("chat_messages")
        .select("conversation_id,sender_id,created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false });

      const participantsByConversation = new Map<string, Array<{ user_id: string; last_read_at: string | null }>>();
      ((allParticipants as any[]) ?? []).forEach((row) => {
        const list = participantsByConversation.get(row.conversation_id) ?? [];
        list.push({ user_id: row.user_id, last_read_at: row.last_read_at });
        participantsByConversation.set(row.conversation_id, list);
      });

      const unreadByConversation = new Map<string, number>();
      ((unreadMessages as any[]) ?? []).forEach((message) => {
        const myParticipant = (participantsByConversation.get(message.conversation_id) ?? []).find((participant) => participant.user_id === user.id);
        const isUnread = !myParticipant?.last_read_at || new Date(message.created_at).getTime() > new Date(myParticipant.last_read_at).getTime();
        if (isUnread) unreadByConversation.set(message.conversation_id, (unreadByConversation.get(message.conversation_id) ?? 0) + 1);
      });
      const lastSenderByConversation = new Map<string, string>();
      ((recentMessages as any[]) ?? []).forEach((message) => {
        if (!lastSenderByConversation.has(message.conversation_id) && message.sender_id) {
          lastSenderByConversation.set(message.conversation_id, message.sender_id);
        }
      });

      const nextConversations: ConversationRow[] = ((conversationRows as any[]) ?? []).map((conversation) => {
        const participants = participantsByConversation.get(conversation.id) ?? [];
        const participantPeerId = participants.find((participant) => participant.user_id !== user.id)?.user_id ?? null;
        const lastSenderId = lastSenderByConversation.get(conversation.id) ?? null;
        const peerId = participantPeerId ?? (lastSenderId && lastSenderId !== user.id ? lastSenderId : null);
        const peerFromScopedUsers = nextUsers.find((profile) => profile.user_id === peerId) ?? null;
        const peerFromParticipants = peerId
          ? participantProfiles
              .filter((p) => p.user_id === peerId)
              .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0] ?? null
          : null;
        const peer =
          peerFromScopedUsers ??
          (peerFromParticipants
            ? {
                user_id: peerFromParticipants.user_id,
              name: peerFromParticipants.name || peerFromParticipants.email || "User",
              email: peerFromParticipants.email || "",
              avatar_url: peerFromParticipants.avatar_url || null,
              role: roleMap.get(peerFromParticipants.user_id) ?? null,
            }
            : peerId
              ? {
                  user_id: peerId,
                  name: "User",
                  email: "",
                  avatar_url: null,
                  role: roleMap.get(peerId) ?? null,
                }
              : null);
        return {
          id: conversation.id,
          last_message_at: conversation.last_message_at,
          peer,
          unread: unreadByConversation.get(conversation.id) ?? 0,
        };
      });
      setConversations(nextConversations);
      if (!nextConversations.length) {
        setActiveConversationId(null);
      } else if (!activeConversationId || !nextConversations.some((conversation) => conversation.id === activeConversationId)) {
        setActiveConversationId(nextConversations[0].id);
      }
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    if (!user) return;
    const { data: rows } = await supabase.from("chat_messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
    const ids = ((rows as any[]) ?? []).map((row) => row.id);
    const { data: reads } = ids.length ? await supabase.from("chat_message_reads").select("message_id,user_id,read_at").in("message_id", ids) : { data: [] as any[] };

    const readsByMessage = new Map<string, Set<string>>();
    const latestSeenByMessage = new Map<string, string>();
    ((reads as any[]) ?? []).forEach((read) => {
      const set = readsByMessage.get(read.message_id) ?? new Set<string>();
      set.add(read.user_id);
      readsByMessage.set(read.message_id, set);
      if (read.read_at) {
        const prev = latestSeenByMessage.get(read.message_id);
        if (!prev || new Date(read.read_at).getTime() > new Date(prev).getTime()) {
          latestSeenByMessage.set(read.message_id, read.read_at);
        }
      }
    });

    const rowsMapped: MessageRow[] = ((rows as any[]) ?? []).map((row) => ({
      ...row,
      read_by_others: [...(readsByMessage.get(row.id) ?? new Set<string>())].filter((userId) => userId !== row.sender_id).length,
    }));
    setMessages(rowsMapped);
    setMessageSeenAt(
      Object.fromEntries(
        rowsMapped.map((message) => [message.id, latestSeenByMessage.get(message.id) ?? null]),
      ),
    );
    await loadReactions(rowsMapped.map((row) => row.id));
  };

  const loadReactions = async (messageIds: string[]) => {
    if (!messageIds.length) {
      setMessageReactions({});
      setMessageReactionMeta({});
      return;
    }
    const { data, error } = await supabase
      .from("chat_message_reactions" as any)
      .select("message_id,user_id,emoji,created_at")
      .in("message_id", messageIds);
    if (error) return;

    const next: Record<string, Record<string, string[]>> = {};
    const nextMeta: Record<string, ReactionMeta[]> = {};
    ((data as any[]) ?? []).forEach((row) => {
      if (!next[row.message_id]) next[row.message_id] = {};
      if (!next[row.message_id][row.emoji]) next[row.message_id][row.emoji] = [];
      next[row.message_id][row.emoji].push(row.user_id);
      if (!nextMeta[row.message_id]) nextMeta[row.message_id] = [];
      nextMeta[row.message_id].push({ emoji: row.emoji, user_id: row.user_id, created_at: row.created_at });
    });
    setMessageReactions(next);
    setMessageReactionMeta(nextMeta);
  };

  const markConversationRead = async (conversationId: string) => {
    if (!user) return;
    const now = new Date().toISOString();
    await supabase.from("chat_participants").update({ last_read_at: now }).eq("conversation_id", conversationId).eq("user_id", user.id);
    const unread = messages
      .filter((message) => message.sender_id !== user.id)
      .map((message) => ({ message_id: message.id, user_id: user.id, read_at: now }));
    if (unread.length) await supabase.from("chat_message_reads").upsert(unread, { onConflict: "message_id,user_id" });
    setConversations((prev) => prev.map((conversation) => (conversation.id === conversationId ? { ...conversation, unread: 0 } : conversation)));
  };

  const getOrCreateConversation = async (peerUserId: string) => {
    if (!user || !companyId) return null;
    const { data: myParticipations } = await supabase.from("chat_participants").select("conversation_id").eq("user_id", user.id);
    const ids = ((myParticipations as any[]) ?? []).map((row: any) => row.conversation_id);
    if (ids.length) {
      const { data: peerRows } = await supabase.from("chat_participants").select("conversation_id,user_id").in("conversation_id", ids).eq("user_id", peerUserId);
      const existing = (peerRows as any[])?.[0]?.conversation_id;
      if (existing) return existing as string;
    }

    const { data: conversation, error } = await supabase
      .from("chat_conversations")
      .insert({ company_id: companyId, created_by: user.id, is_group: false })
      .select("id")
      .single();
    if (error || !conversation?.id) {
      throw new Error(error?.message || "Conversation creation failed.");
    }

    const { error: participantInsertError } = await supabase.from("chat_participants").insert([
      { conversation_id: conversation.id, user_id: user.id, last_read_at: new Date().toISOString() },
      { conversation_id: conversation.id, user_id: peerUserId },
    ]);
    if (participantInsertError) {
      await supabase.from("chat_conversations").delete().eq("id", conversation.id);
      throw new Error(participantInsertError.message || "Failed to add chat participants.");
    }
    return conversation.id as string;
  };

  const sendMessage = async (attachment?: { path: string; name: string; mime: string }) => {
    if (!user || !activeConversationId) return;
    const text = messageText.trim();
    if (!text && !attachment) return;
    setSending(true);
    const { error } = await supabase.from("chat_messages").insert({
      conversation_id: activeConversationId,
      sender_id: user.id,
      content: text || null,
      attachment_path: attachment?.path ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_mime: attachment?.mime ?? null,
    });
    setSending(false);
    if (error) {
      toast({ title: "Message failed", description: error.message, variant: "destructive" });
      return;
    }
    setMessageText("");
    await loadMessages(activeConversationId);
    await markConversationRead(activeConversationId);
    await loadCompanyAndUsers(true);
  };

  const handleAttachment = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from(CHAT_BUCKET).upload(path, file, { upsert: false });
    setUploading(false);
    if (error) {
      toast({ title: "Attachment upload failed", description: error.message, variant: "destructive" });
      return;
    }
    await sendMessage({ path, name: file.name, mime: file.type || "application/octet-stream" });
  };

  const openAttachment = async (path: string) => {
    const { data, error } = await supabase.storage.from(CHAT_BUCKET).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast({ title: "Cannot open attachment", description: error?.message ?? "Signed URL failed", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const toggleVoiceRecording = async () => {
    if (!activeConversationId) return;
    if (recording && recorder) {
      recorder.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({ title: "Voice message unavailable", description: "Your browser does not support audio recording.", variant: "destructive" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setRecorder(null);
        if (!chunks.length) return;
        const audioBlob = new Blob(chunks, { type: "audio/webm" });
        const voiceFile = new File([audioBlob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
        await handleAttachment(voiceFile);
      };
      mediaRecorder.start();
      setRecorder(mediaRecorder);
      setRecording(true);
    } catch (err: any) {
      toast({ title: "Microphone access denied", description: err?.message || "Unable to record voice.", variant: "destructive" });
    }
  };

  const startChatWithUser = async (targetUserId: string) => {
    try {
      const conversationId = await getOrCreateConversation(targetUserId);
      if (!conversationId) {
        toast({ title: "Unable to start chat", description: "Could not create conversation.", variant: "destructive" });
        return;
      }
      await loadCompanyAndUsers(true);
      setActiveConversationId(conversationId);
      setMobileThreadOpen(true);
      setStartChatOpen(false);
      setStartChatSearch("");
    } catch (err: any) {
      toast({ title: "Unable to start chat", description: err.message, variant: "destructive" });
    }
  };

  const deleteConversation = async (conversationId: string) => {
    const target = conversations.find((conversation) => conversation.id === conversationId);
    const confirmation = window.confirm(`Delete chat with ${target?.peer?.name || "this user"}?`);
    if (!confirmation) return;
    const { error } = await supabase.from("chat_conversations").delete().eq("id", conversationId);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    if (activeConversationId === conversationId) {
      setActiveConversationId(null);
      setMessages([]);
      setMobileThreadOpen(false);
    }
    await loadCompanyAndUsers(true);
    toast({ title: "Chat deleted" });
  };

  const deleteMessage = async (messageId: string) => {
    const { error } = await supabase.from("chat_messages").delete().eq("id", messageId);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setMessages((prev) => prev.filter((message) => message.id !== messageId));
    toast({ title: "Message deleted" });
  };

  const addReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    const { error: deleteError } = await supabase
      .from("chat_message_reactions" as any)
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", user.id);
    if (deleteError) {
      toast({
        title: "Reaction save failed",
        description: deleteError.message || "Unable to clear previous reaction.",
        variant: "destructive",
      });
      return;
    }

    const { error: insertError } = await supabase
      .from("chat_message_reactions" as any)
      .insert({ message_id: messageId, user_id: user.id, emoji, created_at: new Date().toISOString() });
    if (insertError) {
      toast({
        title: "Reaction save failed",
        description: insertError.message || "Please verify chat reaction policies.",
        variant: "destructive",
      });
      return;
    }
    await loadReactions(messages.map((message) => message.id));
  };

  const startCall = async (mode: "audio" | "video") => {
    if (!activeConversationId || !activeConversation || !user) {
      toast({ title: "Select a chat first", variant: "destructive" });
      return;
    }
    const safeSlug = (companySlug || "company").replace(/[^a-zA-Z0-9-]/g, "-");
    const room = `mtlhr-${safeSlug}-${activeConversationId}`;
    const url = `https://meet.jit.si/${room}#config.startWithVideoMuted=${mode === "audio"}&config.startAudioOnly=${mode === "audio"}`;

    const inviteText =
      mode === "audio"
        ? `📞 Audio call started. Join here: ${url}`
        : `🎥 Video call started. Join here: ${url}`;

    const { error } = await supabase.from("chat_messages").insert({
      conversation_id: activeConversationId,
      sender_id: user.id,
      content: inviteText,
    });
    if (error) {
      toast({ title: "Call invite failed", description: error.message, variant: "destructive" });
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
    await loadMessages(activeConversationId);
    await loadCompanyAndUsers(true);
    toast({ title: mode === "audio" ? "Audio call started" : "Video call started" });
  };

  useEffect(() => {
    void loadCompanyAndUsers(false);
  }, [user?.id, companySlug]);

  useEffect(() => {
    if (!activeConversationId) return;
    void loadMessages(activeConversationId).then(() => markConversationRead(activeConversationId));
    setMobileThreadOpen(true);
  }, [activeConversationId]);

  useEffect(() => {
    if (!user) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    const channel = supabase
      .channel(`chat-updates-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, async (payload) => {
        const message = payload.new as any;
        if (!message?.conversation_id) return;
        const { data: membership } = await supabase.from("chat_participants").select("id").eq("conversation_id", message.conversation_id).eq("user_id", user.id).maybeSingle();
        if (!membership) return;
        if (message.sender_id !== user.id) {
          toast({ title: "New message", description: "You received a new message." });
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification("New message received");
          }
        }
        await loadCompanyAndUsers(true);
        if (activeConversationId === message.conversation_id) {
          await loadMessages(activeConversationId);
          await markConversationRead(activeConversationId);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_message_reactions" }, async () => {
        await loadReactions(messages.map((message) => message.id));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, activeConversationId, messages]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users.filter((profile) => profile.user_id !== user?.id);
    return users.filter((profile) => profile.user_id !== user?.id && `${profile.name} ${profile.email}`.toLowerCase().includes(q));
  }, [users, search, user?.id]);
  const startChatUsers = useMemo(() => {
    const q = startChatSearch.trim().toLowerCase();
    const base = users.filter((profile) => profile.user_id !== user?.id);
    if (!q) return base;
    return base.filter((profile) => `${profile.name} ${profile.email}`.toLowerCase().includes(q));
  }, [users, user?.id, startChatSearch]);
  const showConversationList = leftRailTab === "chats";
  const showContacts = leftRailTab === "contacts";

  if (loading) {
    return (
      <div className="py-16">
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-slate-500" />
        <p className="mt-3 text-center text-sm text-slate-500">Loading messages...</p>
      </div>
    );
  }

  return (
    <div className="h-screen min-h-[620px] rounded-2xl overflow-hidden border border-slate-200 bg-white grid grid-cols-1 md:grid-cols-[56px_320px_1fr]">
      <aside className="hidden md:flex bg-slate-50 border-r border-slate-200 flex-col items-center py-3 gap-3">
        <div className="h-8 w-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">C</div>
        {[
          { key: "chats", icon: MessageCircle, label: "Chats" },
          { key: "contacts", icon: Users, label: "Contacts" },
          { key: "alerts", icon: Bell, label: "Alerts" },
          { key: "settings", icon: Settings, label: "Settings" },
        ].map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            title={label}
            onClick={() => setLeftRailTab(key as "chats" | "contacts" | "alerts" | "settings")}
            className={`h-9 w-9 rounded-lg flex items-center justify-center ${
              leftRailTab === key ? "bg-blue-100 text-blue-700" : "hover:bg-slate-200 text-slate-600"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </aside>

      <aside className={`${mobileThreadOpen ? "hidden md:flex" : "flex"} border-r border-slate-200 bg-white flex-col`}>
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Chats</h2>
            <Dialog open={startChatOpen} onOpenChange={setStartChatOpen}>
              <DialogTrigger asChild>
                <button type="button" className="h-8 w-8 rounded-full bg-blue-600 text-white font-bold">+</button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Start Chat</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <Input
                    placeholder="Search user..."
                    value={startChatSearch}
                    onChange={(e) => setStartChatSearch(e.target.value)}
                  />
                  <div className="max-h-72 overflow-auto space-y-2">
                    {startChatUsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No users found.</p>
                    ) : (
                      startChatUsers.map((profile) => (
                        <button
                          key={`start-${profile.user_id}`}
                          type="button"
                          className="w-full text-left rounded-lg border p-2 hover:bg-slate-50"
                          onClick={() => void startChatWithUser(profile.user_id)}
                        >
                          <p className="text-sm font-medium">{profile.name}</p>
                          <p className="text-xs text-slate-500">{profile.email}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="relative mt-3">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search For Contacts or Messages" className="pl-9 bg-slate-50 border-slate-200" />
          </div>
        </div>
        {leftRailTab === "alerts" ? (
          <div className="p-4 text-sm text-slate-600">No new alerts.</div>
        ) : null}
        {leftRailTab === "settings" ? (
          <div className="p-4 text-sm text-slate-600">Chat settings will appear here.</div>
        ) : null}
        <div className={`p-3 overflow-auto space-y-2 ${showConversationList || showContacts ? "" : "hidden"}`}>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">{showContacts ? "Recent Contacts" : "Recent Chats"}</p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="text-slate-400 hover:text-slate-600">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => void loadCompanyAndUsers(true)}>Refresh list</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStartChatOpen(true)}>Start new chat</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="mb-3 flex gap-3 overflow-auto pb-1">
              {filteredUsers.slice(0, 5).map((profile) => (
                <button
                  key={`recent-${profile.user_id}`}
                  type="button"
                  className="shrink-0 text-center"
                  onClick={async () => {
                    try {
                      const conversationId = await getOrCreateConversation(profile.user_id);
                      if (!conversationId) return;
                      await loadCompanyAndUsers(true);
                      setActiveConversationId(conversationId);
                      setMobileThreadOpen(true);
                    } catch (err: any) {
                      toast({ title: "Unable to start chat", description: err.message, variant: "destructive" });
                    }
                  }}
                >
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt={profile.name} className="mx-auto h-11 w-11 rounded-full object-cover border border-slate-200" />
                  ) : (
                    <div className="mx-auto h-11 w-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold">
                      {avatarText(profile.name)}
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-slate-600 max-w-14 truncate">{profile.name}</p>
                </button>
              ))}
            </div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">{showContacts ? "All Contacts" : "All Chats"}</p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="text-slate-400 hover:text-slate-600">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => void loadCompanyAndUsers(true)}>Refresh list</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStartChatOpen(true)}>Start new chat</DropdownMenuItem>
                  {role !== "employee" ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={!activeConversationId}
                        className="text-rose-600 focus:text-rose-600"
                        onClick={() => activeConversationId && void deleteConversation(activeConversationId)}
                      >
                        Delete selected chat
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {(showContacts ? filteredUsers.map((profile) => ({ id: `contact-${profile.user_id}`, peer: profile, unread: 0 })) : conversations).map((conversation: any) => (
            <div
              key={conversation.id}
              className={`w-full rounded-xl border p-3 ${conversation.id === activeConversationId ? "bg-blue-50 border-blue-200" : "border-slate-200 hover:bg-slate-50"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (showContacts && conversation.peer?.user_id) {
                      await startChatWithUser(conversation.peer.user_id);
                      return;
                    }
                    setActiveConversationId(conversation.id);
                  }}
                  className="min-w-0 text-left flex-1"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {conversation.peer?.avatar_url ? (
                      <img
                        src={conversation.peer.avatar_url}
                        alt={conversation.peer?.name || "User"}
                        className="h-9 w-9 rounded-full object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0">
                        {avatarText(conversation.peer?.name || "U")}
                      </div>
                    )}
                    <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{displayNameWithTitle(conversation.peer)}</p>
                        <p className="text-xs text-slate-500 truncate">{conversation.peer?.email || "-"}</p>
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-1">
                  {!showContacts && conversation.unread > 0 ? <span className="text-[11px] rounded-full bg-rose-500 text-white px-2 py-0.5">{conversation.unread}</span> : null}
                  {!showContacts && role !== "employee" ? (
                    <button
                      type="button"
                      aria-label="Delete chat"
                      onClick={() => void deleteConversation(conversation.id)}
                      className="h-7 w-7 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section className={`${mobileThreadOpen ? "flex" : "hidden md:flex"} flex-col bg-[#fcfcfe]`}>
        <header className="h-16 border-b border-slate-200 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="md:hidden h-8 w-8 rounded-lg border border-slate-200 text-slate-600"
              onClick={() => setMobileThreadOpen(false)}
            >
              <ChevronLeft className="h-4 w-4 mx-auto" />
            </button>
            {activeConversation?.peer?.avatar_url ? (
              <img
                src={activeConversation.peer.avatar_url}
                alt={activeConversation.peer?.name || "Conversation"}
                className="h-10 w-10 rounded-full object-cover border border-slate-200"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                {avatarText(activeConversation?.peer?.name || "C")}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold">{activeConversation ? displayNameWithTitle(activeConversation.peer) : "Select a chat"}</p>
              <p className="text-xs text-emerald-600">{activeConversation ? "Online" : "No active conversation"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin text-slate-400 mr-1" /> : null}
            {activeConversationId && role !== "employee" ? (
              <button
                type="button"
                className="h-8 w-8 rounded-lg hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center"
                onClick={() => void deleteConversation(activeConversationId)}
                aria-label="Delete active chat"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              disabled={!activeConversationId}
              onClick={() => void startCall("audio")}
              className="h-8 w-8 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
              title="Start audio call"
            >
              <Phone className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!activeConversationId}
              onClick={() => void startCall("video")}
              className="h-8 w-8 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
              title="Start video call"
            >
              <Video className="h-4 w-4" />
            </button>
            <button className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"><Info className="h-4 w-4" /></button>
          </div>
        </header>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">No messages yet</p>
                <p className="text-xs text-slate-500 mt-1">Start the conversation by sending a message.</p>
              </div>
            </div>
          ) : messages.map((message) => {
            const mine = message.sender_id === user?.id;
            const sender = userById(users, message.sender_id);
            return (
              <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`flex items-end gap-2 max-w-[82%] ${mine ? "flex-row-reverse" : "flex-row"}`}>
                  {sender?.avatar_url ? (
                    <img
                      src={sender.avatar_url}
                      alt={sender.name || sender.email || "User"}
                      className="h-8 w-8 rounded-full object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0">
                      {avatarText(sender?.name || sender?.email || "U")}
                    </div>
                  )}
                <div className={`max-w-[76%] rounded-2xl px-4 py-2 ${mine ? "bg-blue-600 text-white" : "bg-white border border-slate-200"}`}>
                  {message.content ? <p className="text-sm whitespace-pre-wrap">{message.content}</p> : null}
                  {message.attachment_path ? (
                    <button
                      type="button"
                      onClick={() => void openAttachment(message.attachment_path!)}
                      className={`text-xs underline ${mine ? "text-blue-100" : "text-blue-700"}`}
                    >
                      {message.attachment_name || "Open attachment"}
                    </button>
                  ) : null}
                  {messageReactions[message.id] ? (
                    <div className="mt-1 flex items-center gap-1 overflow-x-auto whitespace-nowrap">
                      {Object.entries(messageReactions[message.id]).map(([emoji, userIds]) => (
                        <span
                          key={`${message.id}-${emoji}`}
                          className={`rounded-full px-2 py-0.5 text-[10px] ${
                            (userIds ?? []).includes(user?.id || "")
                              ? (mine ? "bg-white/30 text-white" : "bg-blue-100 text-blue-700")
                              : (mine ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700")
                          }`}
                        >
                          {emoji} {userIds.length}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className={`mt-1 text-[10px] flex items-center gap-1 ${mine ? "text-blue-100" : "text-slate-500"}`}>
                    <span>{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    {mine ? (message.read_by_others > 0 ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="ml-1 rounded p-0.5 hover:bg-black/10">
                          <MoreVertical className="h-3 w-3 opacity-80" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={mine ? "end" : "start"} className="w-56">
                        <DropdownMenuLabel className="text-xs text-slate-500">React</DropdownMenuLabel>
                        <div className="px-2 pb-2">
                          <div className="flex items-center gap-1 rounded-md border border-slate-200 p-1">
                            {["👍", "❤️", "😂", "🎉", "🔥", "👏"].map((emoji) => (
                              <button
                                key={`${message.id}-${emoji}`}
                                type="button"
                                className="h-7 w-7 rounded-md text-base hover:bg-slate-100"
                                onClick={() => void addReaction(message.id, emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs text-slate-500">Message info</DropdownMenuLabel>
                        <DropdownMenuItem disabled>
                          Seen: {messageSeenAt[message.id] ? new Date(messageSeenAt[message.id] as string).toLocaleString() : "Not seen yet"}
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled>
                          Last reaction: {(() => {
                            const reactions = messageReactionMeta[message.id] ?? [];
                            if (!reactions.length) return "No reactions";
                            const latest = reactions.reduce((acc, r) =>
                              new Date(r.created_at).getTime() > new Date(acc.created_at).getTime() ? r : acc
                            );
                            return new Date(latest.created_at).toLocaleString();
                          })()}
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled className="block whitespace-normal">
                          Reacted by: {(() => {
                            const reactions = messageReactionMeta[message.id] ?? [];
                            if (!reactions.length) return "No users yet";
                            const labels = reactions
                              .map((reaction) => {
                                const profile = users.find((u) => u.user_id === reaction.user_id);
                                const display = profile?.name || profile?.email || `${reaction.user_id.slice(0, 8)}...`;
                                return `${reaction.emoji} ${display}`;
                              })
                              .slice(0, 6);
                            return labels.join(", ");
                          })()}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {message.content ? (
                          <DropdownMenuItem
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(message.content || "");
                                toast({ title: "Message copied" });
                              } catch {
                                toast({ title: "Copy failed", description: "Clipboard permission denied.", variant: "destructive" });
                              }
                            }}
                          >
                            <Copy className="mr-2 h-3.5 w-3.5" />
                            Copy text
                          </DropdownMenuItem>
                        ) : null}
                        {message.attachment_path ? (
                          <DropdownMenuItem onClick={() => void openAttachment(message.attachment_path!)}>
                            <ExternalLink className="mr-2 h-3.5 w-3.5" />
                            Open attachment
                          </DropdownMenuItem>
                        ) : null}
                        {mine && role !== "employee" ? (
                          <DropdownMenuItem
                            className="text-rose-600 focus:text-rose-600"
                            onClick={() => void deleteMessage(message.id)}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            Delete message
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                </div>
              </div>
            );
          })}
        </div>

        <footer className="p-3 border-t border-slate-200 bg-white">
          <div className="flex items-center gap-2">
            <label className="inline-flex">
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleAttachment(file);
                  e.currentTarget.value = "";
                }}
              />
              <Button type="button" variant="outline" disabled={!activeConversationId || uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </Button>
            </label>
            <Button type="button" variant="outline" disabled={!activeConversationId || uploading || sending} onClick={() => void toggleVoiceRecording()}>
              {recording ? <Square className="h-4 w-4 text-rose-600" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder={recording ? "Recording voice... click stop icon to send" : "Type your message..."}
              disabled={!activeConversationId}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
            />
            <Button type="button" disabled={!activeConversationId || sending} onClick={() => void sendMessage()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </footer>
      </section>

    </div>
  );
}
