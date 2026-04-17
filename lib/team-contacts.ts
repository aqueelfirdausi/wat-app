import { Product, TeamContact } from "@/lib/types";

export const MASTER_ADMIN_CONTACT_ID = "aqueel-firdausi";

export const TEAM_CONTACTS: TeamContact[] = [
  {
    id: "aqueel-firdausi",
    name: "Aqueel Firdausi",
    label: "Admin",
    localPhone: "03158255777",
    whatsappNumber: "923158255777",
    active: true
  },
  {
    id: "umer-farooq",
    name: "Umer Farooq",
    label: "Sales",
    localPhone: "03312890323",
    whatsappNumber: "923312890323",
    active: true
  },
  {
    id: "abdullah-bin-aqueel",
    name: "Abdullah Bin Aqueel",
    label: "Sales",
    localPhone: "03168232872",
    whatsappNumber: "923168232872",
    active: true
  },
  {
    id: "saaim-shakil",
    name: "Saaim Shakil",
    label: "Sales",
    localPhone: "03253478815",
    whatsappNumber: "923253478815",
    active: true
  }
];

export function getActiveTeamContacts() {
  return TEAM_CONTACTS.filter((contact) => contact.active);
}

export function getTeamContactById(contactId?: string) {
  if (!contactId) {
    return undefined;
  }

  return getActiveTeamContacts().find((contact) => contact.id === contactId);
}

export function getDefaultTeamContact() {
  return getTeamContactById(MASTER_ADMIN_CONTACT_ID) ?? getActiveTeamContacts()[0];
}

export function resolveProductContact(
  product: Pick<Product, "preferredContactId" | "assignedContactId" | "contactId" | "contactName" | "contactWhatsappNumber">
) {
  const configuredContact = getTeamContactById(product.preferredContactId ?? product.assignedContactId ?? product.contactId);

  if (configuredContact) {
    return configuredContact;
  }

  if (product.contactName && product.contactWhatsappNumber) {
    return {
      id: product.assignedContactId ?? product.contactId ?? "inline-contact",
      name: product.contactName,
      label: "Sales" as const,
      localPhone: product.contactWhatsappNumber,
      whatsappNumber: product.contactWhatsappNumber,
      active: true
    };
  }

  return getDefaultTeamContact();
}
