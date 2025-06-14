import { useEffect } from 'react';

export interface SEOData {
  title: string;
  description: string;
  keywords: string[];
  image?: string;
  url?: string;
  type?: string;
  siteName?: string;
  twitterCard?: string;
  twitterSite?: string;
  author?: string;
  canonical?: string;
  robots?: string;
  structuredData?: any;
}

export const useSEO = (seoData: SEOData) => {
  useEffect(() => {
    // Update document title
    document.title = seoData.title;

    // Helper function to update or create meta tags
    const updateMetaTag = (selector: string, content: string, isProperty = false) => {
      const attribute = isProperty ? 'property' : 'name';
      let metaTag = document.querySelector(`meta[${attribute}="${selector}"]`);
      
      if (!metaTag) {
        metaTag = document.createElement('meta');
        metaTag.setAttribute(attribute, selector);
        document.head.appendChild(metaTag);
      }
      
      metaTag.setAttribute('content', content);
    };

    // Helper function to update or create link tags
    const updateLinkTag = (rel: string, href: string) => {
      let linkTag = document.querySelector(`link[rel="${rel}"]`);
      
      if (!linkTag) {
        linkTag = document.createElement('link');
        linkTag.setAttribute('rel', rel);
        document.head.appendChild(linkTag);
      }
      
      linkTag.setAttribute('href', href);
    };

    // Basic meta tags
    updateMetaTag('description', seoData.description);
    updateMetaTag('keywords', seoData.keywords.join(', '));
    updateMetaTag('author', seoData.author || 'GiveRep');
    updateMetaTag('robots', seoData.robots || 'index, follow');

    // Open Graph tags
    updateMetaTag('og:title', seoData.title, true);
    updateMetaTag('og:description', seoData.description, true);
    updateMetaTag('og:type', seoData.type || 'website', true);
    updateMetaTag('og:site_name', seoData.siteName || 'GiveRep', true);
    
    if (seoData.image) {
      updateMetaTag('og:image', seoData.image, true);
      updateMetaTag('og:image:type', 'image/jpeg', true);
      updateMetaTag('og:image:width', '1200', true);
      updateMetaTag('og:image:height', '630', true);
      updateMetaTag('og:image:alt', seoData.title, true);
    }
    
    if (seoData.url) {
      updateMetaTag('og:url', seoData.url, true);
    }

    // Twitter Card tags
    updateMetaTag('twitter:card', seoData.twitterCard || 'summary_large_image');
    updateMetaTag('twitter:site', seoData.twitterSite || '@GiveRepApp');
    updateMetaTag('twitter:title', seoData.title);
    updateMetaTag('twitter:description', seoData.description);
    
    if (seoData.image) {
      updateMetaTag('twitter:image', seoData.image);
      updateMetaTag('twitter:image:alt', seoData.title);
    }

    // Canonical URL
    if (seoData.canonical) {
      updateLinkTag('canonical', seoData.canonical);
    }

    // Structured data (JSON-LD)
    if (seoData.structuredData) {
      let structuredDataScript = document.querySelector('script[type="application/ld+json"]');
      
      if (!structuredDataScript) {
        structuredDataScript = document.createElement('script');
        structuredDataScript.setAttribute('type', 'application/ld+json');
        document.head.appendChild(structuredDataScript);
      }
      
      structuredDataScript.textContent = JSON.stringify(seoData.structuredData);
    }

    // Cleanup function to avoid memory leaks
    return () => {
      // No cleanup needed for meta tags as they should persist for the page
    };
  }, [seoData]);
};

export default useSEO;