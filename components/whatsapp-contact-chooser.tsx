"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { getActiveTeamContacts, resolveProductContact } from "@/lib/team-contacts";
import { Product } from "@/lib/types";
import { buildWhatsAppLink, getWhatsAppCtaLabel, isProductSoldOut } from "@/lib/utils";
import styles from "@/components/whatsapp-chooser-button.module.css";

type WhatsAppChooserButtonProps = {
  product: Product;
  className?: string;
  label?: string;
  analyticsContext?: "catalog" | "feed" | "detail";
};

export function WhatsAppChooserButton({
  product,
  className = "whatsapp-button",
  label,
  analyticsContext
}: WhatsAppChooserButtonProps) {
  const preferredContact = resolveProductContact(product);
  const [isMounted, setIsMounted] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const isSoldOut = isProductSoldOut(product);
  const resolvedLabel = label ?? getWhatsAppCtaLabel(product);
  const chooserTitle = isSoldOut ? "Ask about availability" : "Start your WhatsApp chat";
  const chooserDescription = isSoldOut
    ? "Select the team member you want to ask about restock timing or a similar option."
    : "Select the team member you want to message about this product.";

  const contactOptions = useMemo(() => {
    const activeContacts = getActiveTeamContacts();

    if (!preferredContact) {
      return activeContacts.map((contact) => ({
        ...contact,
        isSuggested: false
      }));
    }

    return [
      ...activeContacts.filter((contact) => contact.id === preferredContact.id).map((contact) => ({ ...contact, isSuggested: true })),
      ...activeContacts.filter((contact) => contact.id !== preferredContact.id).map((contact) => ({ ...contact, isSuggested: false }))
    ];
  }, [preferredContact]);

  useEffect(() => {
    setIsMounted(true);

    return () => {
      setIsMounted(false);
    };
  }, []);

  useEffect(() => {
    if (!isContactModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isContactModalOpen]);

  function handleContactChoice(contactId: string) {
    const selectedContact = contactOptions.find((contact) => contact.id === contactId);
    if (!selectedContact) {
      return;
    }

    const whatsappLink = buildWhatsAppLink(product.name, product.price, product.condition, {
      phone: selectedContact.whatsappNumber,
      contactName: selectedContact.name,
      stockStatus: product.stockStatus
    });

    window.open(whatsappLink, "_blank", "noopener,noreferrer");
    setIsContactModalOpen(false);
  }

  function getContactInitials(name: string) {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  const modal = (
    <div className="contact-modal-backdrop" role="presentation" onClick={() => setIsContactModalOpen(false)}>
      <div className="contact-modal-sheet" role="dialog" aria-modal="true" aria-label="Choose a team member" onClick={(event) => event.stopPropagation()}>
        <div className="contact-modal-header">
          <div>
            <p className="eyebrow">Choose a team member</p>
            <h3>{chooserTitle}</h3>
            <p>{chooserDescription}</p>
            <div className="contact-modal-product">{product.name}</div>
          </div>
          <button type="button" className="contact-modal-close" onClick={() => setIsContactModalOpen(false)} aria-label="Close contact chooser">
            &times;
          </button>
        </div>
        <div className={styles.list}>
          {contactOptions.map((contact) => (
            <button key={contact.id} type="button" className={styles.card} onClick={() => handleContactChoice(contact.id)}>
              <span className={styles.avatar} aria-hidden="true">
                {getContactInitials(contact.name)}
              </span>
              <span className={styles.copy}>
                <span className={styles.head}>
                  <strong className={styles.name}>{contact.name}</strong>
                  {contact.isSuggested ? <span className={styles.badge}>Suggested</span> : null}
                </span>
                <span className={styles.role}>{contact.label}</span>
              </span>
              <span className={styles.actionButton}>{isSoldOut ? "Ask" : "Open"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          trackAnalyticsEvent({
            eventName: "whatsapp_click",
            context: analyticsContext,
            product
          });
          setIsContactModalOpen(true);
        }}
      >
        {resolvedLabel}
      </button>

      {isMounted && isContactModalOpen ? createPortal(modal, document.body) : null}
    </>
  );
}
