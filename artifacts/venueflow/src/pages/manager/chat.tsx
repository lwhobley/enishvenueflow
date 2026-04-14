import { useState, useRef, useEffect } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import { useListMessages, getListMessagesQueryKey, useSendMessage } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";
import { Send, Hash } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

type Channel = "general" | "managers" | "announcements";

export default function ManagerChat() {
  const { activeVenue, activeUser } = useAppContext();
  const [channel, setChannel] = useState<Channel>("general");
  const [newMessage, setNewMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: messages } = useListMessages(
    { venueId: activeVenue?.id || "", channel },
    { 
      query: { 
        enabled: !!activeVenue?.id, 
        queryKey: getListMessagesQueryKey({ venueId: activeVenue?.id || "", channel }),
        refetchInterval: 5000 
      } 
    }
  );

  const sendMessage = useSendMessage();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeVenue || !activeUser) return;

    sendMessage.mutate({
      data: {
        venueId: activeVenue.id,
        senderId: activeUser.id,
        channel,
        content: newMessage
      }
    }, {
      onSuccess: () => {
        setNewMessage("");
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey({ venueId: activeVenue.id, channel }) });
      }
    });
  };

  const channels: { id: Channel; name: string }[] = [
    { id: "general", name: "General" },
    { id: "managers", name: "Managers Only" },
    { id: "announcements", name: "Announcements" }
  ];

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Team Chat</h1>
      </div>

      <Card className="flex-1 flex overflow-hidden">
        {/* Channel Sidebar */}
        <div className="w-64 border-r bg-muted/20 flex flex-col">
          <div className="p-4 font-semibold border-b">Channels</div>
          <div className="p-2 space-y-1 flex-1 overflow-y-auto">
            {channels.map(c => (
              <button
                key={c.id}
                onClick={() => setChannel(c.id)}
                className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors ${
                  channel === c.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                <Hash className="w-4 h-4 mr-2 opacity-70" />
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          <CardHeader className="border-b py-4">
            <CardTitle className="text-lg flex items-center">
              <Hash className="w-5 h-5 mr-2 text-muted-foreground" />
              {channels.find(c => c.id === channel)?.name}
            </CardTitle>
          </CardHeader>
          
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-6">
              {messages?.map(msg => (
                <div key={msg.id} className={`flex gap-3 ${msg.senderId === activeUser?.id ? 'flex-row-reverse' : ''}`}>
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {msg.senderName?.substring(0, 2).toUpperCase() || '??'}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`flex flex-col ${msg.senderId === activeUser?.id ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-sm font-medium">{msg.senderName}</span>
                      <span className="text-xs text-muted-foreground">{format(new Date(msg.createdAt), 'p')}</span>
                    </div>
                    <div className={`px-4 py-2 rounded-lg text-sm ${
                      msg.senderId === activeUser?.id 
                        ? 'bg-primary text-primary-foreground rounded-tr-none' 
                        : 'bg-muted rounded-tl-none'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}
              {!messages?.length && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No messages in this channel yet.
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-4 border-t">
            <form onSubmit={handleSend} className="flex gap-2">
              <Input 
                placeholder={`Message #${channel}...`} 
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                disabled={sendMessage.isPending}
                className="flex-1"
              />
              <Button type="submit" disabled={!newMessage.trim() || sendMessage.isPending} size="icon">
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      </Card>
    </div>
  );
}
