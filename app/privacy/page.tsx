import LegalPage from "@/components/LegalPage";

export const metadata = { title: "Privacy policy · VenueScout" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>VenueScout is a private sales tool used by a New York event venue&apos;s own team to track business prospects. It is not open to the public; only people the venue invites can sign in.</p>
      <h3>What we collect</h3>
      <p><b>Team members:</b> name, work email, role, and a password (stored only as a one-way hash). If you choose &ldquo;Sign in with Google&rdquo;, Google shares your name and email address with VenueScout so we can match you to your invite. We do not receive your Google password or access your Gmail, Drive, or other Google data.</p>
      <p><b>Prospects:</b> business contact details (company, name, job title, work email, phone) that the team enters or looks up from business data services such as Apollo.io, and booking history from the venue&apos;s own Tripleseat account.</p>
      <p><b>Activity:</b> an audit log of sign-ins and changes, including IP address, kept so the venue can see who changed what.</p>
      <h3>How we use it</h3>
      <p>Only to run the venue&apos;s sales work: signing team members in, organizing prospects, and planning outreach. We do not sell or rent any data, and we do not use it for advertising.</p>
      <h3>Where it is stored</h3>
      <p>Data is stored with our hosting and database providers (Vercel and Neon) in the United States, encrypted in transit. Sign-in sessions use a secure, http-only cookie.</p>
      <h3>Your choices</h3>
      <p>Team members can ask the venue&apos;s VenueScout Owner to correct or delete their account. Anyone whose business contact details are stored can ask the venue to correct or remove them.</p>
      <h3>Contact</h3>
      <p>Questions about this policy go to the venue team that runs VenueScout, through the person who contacted you or invited you.</p>
    </LegalPage>
  );
}
