import { useState, useRef, useEffect } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import { useListMessages, getListMessagesQueryKey, useSendMessage } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";
import { Send, Hash } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function EmployeeChat() {
  const { activeVenue, activeUser } = useAppContext();
  const [newMessage, setNewMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: messages } = useListMessages(
    { venueId: activeVenue?.id || "", channel: "general" },
    { 
      query: { 
        enabled: !!activeVenue?.id, 
        queryKey: getListMessagesQueryKey({ venueId: activeVenue?.id || "", channel: "general" }),
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
        channel: "general",
        content: newMessage
      }
    }, {
      onSuccess: () => {
        setNewMessage("");
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey({ venueId: activeVenue.id, channel: "general" }) });
      }
    });
  };

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Team Chat</h1>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="border-b py-4 bg-muted/20">
          <CardTitle className="text-lg flex items-center">
            <Hash className="w-5 h-5 mr-2 text-muted-foreground" />
            General
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
                No messages in general chat yet.
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t bg-muted/10">
          <form onSubmit={handleSend} className="flex gap-2">
            <Input 
              placeholder="Type a message..." 
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
      </Card>
    </div>
  );
}
