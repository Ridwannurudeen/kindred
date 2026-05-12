export type Persona = {
  id: string;
  name: string;
  tag: string;
  org: string;
  orgId: string;
  search: string;
  partner?: { profileId: string; orgId: string; expectedScore: number; relationship: string };
};

export const PERSONAS: Persona[] = [
  {
    id: "maya",
    name: "Maya",
    tag: "Adoptee",
    org: "Oregon Adoption Registry",
    orgId: "OAR",
    search: "Searching for biological mother",
    partner: {
      profileId: "TAR-002",
      orgId: "TAR",
      expectedScore: 20,
      relationship: "parent–child",
    },
  },
  {
    id: "aiden",
    name: "Aiden",
    tag: "Donor-conceived",
    org: "Donor-Conceived Network",
    orgId: "DCN",
    search: "Searching for half-siblings (shared donor)",
    partner: {
      profileId: "DCN-004",
      orgId: "DCN",
      expectedScore: 15,
      relationship: "half-sibling",
    },
  },
  {
    id: "noor",
    name: "Noor",
    tag: "Refugee",
    org: "UNHCR Family Tracing",
    orgId: "UNHCR",
    search: "Searching for separated cousin",
  },
  {
    id: "ren",
    name: "Ren",
    tag: "Diaspora",
    org: "Diaspora Heritage Foundation",
    orgId: "DHF",
    search: "Searching for estranged uncle",
    partner: {
      profileId: "DHF-003",
      orgId: "DHF",
      expectedScore: 15,
      relationship: "avuncular",
    },
  },
];

export const ORGS = [
  { id: "OAR", name: "Oregon Adoption Registry", memberCount: 5 },
  { id: "TAR", name: "Texas Adoption Registry", memberCount: 5 },
  { id: "DCN", name: "Donor-Conceived Network", memberCount: 5 },
  { id: "UNHCR", name: "UNHCR Family Tracing", memberCount: 5 },
  { id: "DHF", name: "Diaspora Heritage Foundation", memberCount: 5 },
];

export const FEDERATION_AGREEMENTS = [
  { a: "OAR", b: "TAR", signedAt: "2026-04-12" },
];
