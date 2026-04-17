"use client";

import { useEffect, useMemo, useState } from "react";
import { getActiveTeamContacts, resolveProductContact } from "@/lib/team-contacts";
import { Product } from "@/lib/types";
import { buildWhatsAppLink } from "@/lib/utils";

type WhatsAppChooserButtonProps = {
  product: Product;
  className?: string;
  label?: string;
};

export function WhatsAppChooserButton({
  product,
  className = "whatsapp-button",
  label = "Ask on WhatsApp"
}: WhatsAppChooserButtonProps) {
  const preferredContact = resolveProductContact(product);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);

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
      contactName: selectedContact.name
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

  return (
    <>
      <button type="button" className={className} onClick={() => setIsContactModalOpen(true)}>
        {label}
      </button>

      {isContactModalOpen ? (
        <div className="contact-modal-backdrop" role="presentation" onClick={() => setIsContactModalOpen(false)}>
          <div className="contact-modal-sheet" role="dialog" aria-modal="true" aria-label="Choose a team member" onClick={(event) => event.stopPropagation()}>
            <div className="contact-modal-header">
              <div>
                <p className="eyebrow">Choose a team member</p>
                <h3>Start your WhatsApp chat</h3>
                <p>Select the team member you want to message about this product.</p>
                <div className="contact-modal-product">{product.name}</div>
              </div>
              <button type="button" className="contact-modal-close" onClick={() => setIsContactModalOpen(false)} aria-label="Close contact chooser">
                ×
              </button>
            </div>
            <div className="contact-option-list">
              {contactOptions.map((contact) => (
                <button key={contact.id} type="button" className="contact-option-card" onClick={() => handleContactChoice(contact.id)}>
                  <div className="contact-option-main">
                    <span className="contact-avatar" aria-hidden="true">
                      {getContactInitials(contact.name)}
                    </span>
                    <div>
                      <div className="contact-option-title">
                        <strong>{contact.name}</strong>
                        {contact.isSuggested ? <span className="suggested-badge">Suggested</span> : null}
                      </div>
                      <span>{contact.label}</span>
                    </div>
                  </div>
                  <span className="contact-option-arrow">Open</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
