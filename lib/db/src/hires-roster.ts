/**
 * The roster of employees we want to ensure exist in every venue. Each
 * entry's PIN is the last four digits of `phone`. Adding a new hire is a
 * matter of appending here and redeploying — `loadHires()` is idempotent
 * (matches by venueId+email) and runs at api-server startup.
 */
export type Hire = {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string | null;  // YYYY-MM-DD or null
  address: string;
  positions: string[];         // first one is matched against existing roles
  hireDate: string;            // YYYY-MM-DD
  hourlyRate: number | null;
};

export const NEW_HIRES_ROSTER: Hire[] = [
  // ── 4/23/2026 batch ─────────────────────────────────────────────────────
  {
    fullName: "Adriel L. Thomas",
    email: "theadrielthomas@gmail.com",
    phone: "904-415-1565",
    dateOfBirth: "2000-07-06",
    address: "3323 McCue Rd Apt 1242, Houston, TX 77056",
    positions: ["bartender"],
    hireDate: "2026-04-23",
    hourlyRate: null,
  },
  {
    fullName: "Delcasia M. Lee",
    email: "princessdelcasia@yahoo.com",
    phone: "832-552-3211",
    dateOfBirth: "1994-02-16",
    address: "301 Wilcrest Dr Apt 3102, Houston, TX 77042",
    positions: ["bartender"],
    hireDate: "2026-04-23",
    hourlyRate: null,
  },
  {
    fullName: "Boma R. Briggs",
    email: "bomabriggs9393@gmail.com",
    phone: "832-785-4607",
    dateOfBirth: "1993-04-10",
    address: "3206 Rose Mary Park Ln, Houston, TX 77082",
    positions: ["host", "server"],
    hireDate: "2026-04-23",
    hourlyRate: 18,
  },
  {
    fullName: "Joshua H. Simmons",
    email: "joshua.simmons@mediatech.edu",
    phone: "832-403-9120",
    dateOfBirth: "1993-12-18",
    address: "1617 Enid St Apt 487, Houston, TX 77009",
    positions: ["host", "server"],
    hireDate: "2026-04-23",
    hourlyRate: 18,
  },
  {
    fullName: "Toi L. Gladney",
    email: "toisresume6@yahoo.com",
    phone: "713-388-6686",
    dateOfBirth: "1977-05-14",
    address: "P.O. Box 88188, Houston, TX 77288",
    positions: ["host"],
    hireDate: "2026-04-23",
    hourlyRate: null,
  },
  // ── Second batch (4/13–4/23) ────────────────────────────────────────────
  {
    fullName: "Iyanna L. Maiakasuka",
    email: "iyannaglow@gmail.com",
    phone: "214-937-1833",
    dateOfBirth: "2007-02-26",
    address: "2810 Riverby Rd #580, Houston, TX 77020",
    positions: ["server"],
    hireDate: "2026-04-13",
    hourlyRate: null,
  },
  {
    fullName: "Ne'Ajah J. Smith",
    email: "smithajah657@gmail.com",
    phone: "972-589-3075",
    dateOfBirth: "2007-04-04",
    address: "2810 Riverby Rd #580, Houston, TX 77020",
    positions: ["server"],
    hireDate: "2026-04-23",
    hourlyRate: null,
  },
  {
    fullName: "Bette M. Anderson",
    email: "bettejeanmarie@gmail.com",
    phone: "816-938-6205",
    dateOfBirth: "1999-11-19",
    address: "8850 Long Point Rd Apt 2213, Houston, TX 77055",
    positions: ["server"],
    hireDate: "2026-04-22",
    hourlyRate: null,
  },
  {
    fullName: "Joaquin Y. Hernandez",
    email: "197019631z@gmail.com",
    phone: "832-371-7291",
    dateOfBirth: null,
    address: "2757 Briargrove Dr #521, Houston, TX 77057",
    positions: ["busser"],
    hireDate: "2026-04-23",
    hourlyRate: null,
  },
  {
    fullName: "Korrin A. McNabb",
    email: "alexia.korrin@gmail.com",
    phone: "281-222-4929",
    dateOfBirth: "1995-03-16",
    address: "22702 Steel Blue Jaybird Dr, Hockley, TX 77447",
    positions: ["bartender"],
    hireDate: "2026-04-23",
    hourlyRate: null,
  },
];

export function lastFourDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) throw new Error(`Phone "${phone}" has fewer than 4 digits`);
  return digits.slice(-4);
}
