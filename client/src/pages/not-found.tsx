import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home, ArrowLeft } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function NotFound() {
  const [location] = useLocation();
  
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-lg mx-4 bg-secondary border-border">
        <CardContent className="pt-8 pb-6 px-6">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <AlertCircle className="h-16 w-16 text-red-400" />
            </div>
            
            <h1 className="text-3xl font-bold text-foreground mb-2">404</h1>
            <h2 className="text-xl font-semibold text-foreground mb-4">Page Not Found</h2>
            
            <p className="text-muted-foreground mb-2">
              The page you're looking for doesn't exist.
            </p>
            
            <p className="text-muted-foreground text-sm mb-6">
              Requested: <code className="bg-accent px-2 py-1 rounded text-amber-400">{location}</code>
            </p>
            
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/">
                  <Button className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground">
                    <Home className="h-4 w-4 mr-2" />
                    Go Home
                  </Button>
                </Link>
                
                <Button 
                  variant="outline" 
                  className="w-full sm:w-auto bg-transparent border-border text-foreground hover:bg-accent"
                  onClick={() => window.history.back()}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Go Back
                </Button>
              </div>
              
              <div className="text-center">
                <p className="text-muted-foreground text-xs">
                  Looking for the admin dashboard? Try <Link href="/admin" className="text-primary hover:text-primary/80 underline">/admin</Link>
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
