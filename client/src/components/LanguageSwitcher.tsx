import { useTranslation } from "react-i18next";
import { TbLanguage, TbCheck } from "react-icons/tb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { languages, getLanguageByCode } from "@/translations/languages";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect } from "react";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    
    // Update document direction based on language
    const language = getLanguageByCode(lng);
    if (language?.rtl) {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = lng;
    } else {
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = lng;
    }
  };

  // Set initial direction based on current language
  useEffect(() => {
    const language = getLanguageByCode(i18n.language);
    if (language?.rtl) {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = i18n.language;
    } else {
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = i18n.language;
    }
  }, [i18n.language]);

  const currentLanguage = getLanguageByCode(i18n.language);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="outline-none">
        <div className="flex items-center gap-1 text-gray-300 hover:text-white transition-colors cursor-pointer p-1.5 rounded-sm hover:bg-[#1a1c29]">
          <TbLanguage className="h-5 w-5" />
          <span className="hidden sm:inline text-sm">
            {currentLanguage?.nativeName || i18n.language}
          </span>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-[#12131e] border border-[#2b2d3c] text-white w-64 p-0 rounded-sm z-[100]" align="end">
        <ScrollArea className="h-[400px]">
          <div className="p-1">
            {languages.map((language) => {
              const isActive = i18n.language === language.code || 
                             i18n.language.startsWith(language.code + '-') ||
                             (language.code === 'zh-CN' && i18n.language === 'zh');
              
              return (
                <DropdownMenuItem
                  key={language.code}
                  className={`cursor-pointer hover:bg-[#1a1b29] rounded-sm px-3 py-2.5 text-sm flex items-center justify-between ${
                    isActive ? 'bg-[#1a1b29]' : ''
                  }`}
                  onClick={() => changeLanguage(language.code)}
                >
                  <div>
                    <div className={`${isActive ? 'text-primary' : 'text-white'}`}>
                      {language.nativeName}
                    </div>
                    <div className="text-xs text-gray-500">
                      {language.name}
                    </div>
                  </div>
                  {isActive && (
                    <TbCheck className="h-4 w-4 text-primary" />
                  )}
                </DropdownMenuItem>
              );
            })}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}