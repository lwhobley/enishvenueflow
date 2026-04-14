import { useAppContext } from "@/hooks/use-app-context";
import { useListVenues } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Plus, CheckCircle2 } from "lucide-react";

export default function ManagerVenues() {
  const { activeVenue, setActiveVenue } = useAppContext();
  const { data: venues } = useListVenues();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">My Venues</h1>
        <Button>
          <Plus className="w-4 h-4 mr-2" /> Add Venue
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {venues?.map(venue => (
          <Card 
            key={venue.id} 
            className={`cursor-pointer transition-all hover:shadow-md ${activeVenue?.id === venue.id ? 'border-primary ring-1 ring-primary' : ''}`}
            onClick={() => setActiveVenue(venue)}
          >
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <CardTitle className="text-xl flex items-center">
                  <MapPin className="w-5 h-5 mr-2 text-muted-foreground" />
                  {venue.name}
                </CardTitle>
                {activeVenue?.id === venue.id && (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                )}
              </div>
              <CardDescription>{venue.address}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="capitalize">{venue.subscriptionTier} Plan</Badge>
                {venue.isActive ? (
                  <Badge className="bg-green-500 hover:bg-green-600 text-white border-transparent">Active</Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground mt-4">
                Timezone: {venue.timezone}
              </div>
            </CardContent>
            <CardFooter className="pt-0 pb-4">
              <Button 
                variant={activeVenue?.id === venue.id ? "secondary" : "outline"} 
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveVenue(venue);
                }}
              >
                {activeVenue?.id === venue.id ? "Current Venue" : "Switch to Venue"}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
