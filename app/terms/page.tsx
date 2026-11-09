import LegalPage from "@/components/LegalPage";

export const metadata = { title: "Terms of service · VenueScout" };

export default function Terms() {
  return (
    <LegalPage title="Terms of service">
      <p>VenueScout is an internal sales tool for a New York event venue&apos;s team. By signing in you agree to these terms.</p>
      <h3>Who can use it</h3>
      <p>Only people invited by the venue&apos;s Owner or a Manager. Access can be turned off at any time.</p>
      <h3>Using it properly</h3>
      <p>Use VenueScout only for the venue&apos;s business. Keep your sign-in to yourself, don&apos;t copy prospect data out for other purposes, and follow applicable email and privacy laws (such as CAN-SPAM) when contacting prospects.</p>
      <h3>Third-party services</h3>
      <p>Some features connect to services such as Google, Apollo.io, and Tripleseat. Their own terms apply to those services.</p>
      <h3>No warranty</h3>
      <p>VenueScout is provided as is. Ratings, suggestions, and looked-up company details are guides, not guarantees.</p>
      <h3>Changes</h3>
      <p>We may update these terms; the date above shows the latest version.</p>
    </LegalPage>
  );
}
