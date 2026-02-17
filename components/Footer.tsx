import { MessageCircle } from 'lucide-react';
import { appConfig } from '../config';

export const Footer = () => {
  const whatsappNumber = appConfig.whatsappNumber;
  const whatsappLink = whatsappNumber ? `https://wa.me/${whatsappNumber.replace(/\D/g, '')}` : null;

  return (
    <footer className="w-full py-4 px-4 bg-background border-t border-border/40">
      <div className="flex flex-col items-center justify-center gap-3 text-xs text-muted-foreground">
        {whatsappLink && (
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-primary transition-colors duration-200"
          >
            Having problem? Upload
            <MessageCircle className="w-4 h-4" />
            <span>{whatsappNumber}</span>
          </a>
        )}
      </div>
    </footer>
  );
};
