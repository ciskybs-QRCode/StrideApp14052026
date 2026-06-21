import { Router, Route, Switch } from "wouter";
import Landing              from "./pages/Landing";
import Register             from "./pages/Register";
import Activate             from "./pages/Activate";
import Join                 from "./pages/Join";
import PaymentSuccessPage   from "./pages/PaymentSuccess";
import PaymentCancelledPage from "./pages/PaymentCancelled";
import PaymentBatchPage     from "./pages/PaymentBatch";
import BillingSuccessPage   from "./pages/BillingSuccess";
import BillingCancelPage    from "./pages/BillingCancel";
import StripeReturnPage     from "./pages/StripeReturn";
import TermsPage            from "./pages/Terms";
import PrivacyPage          from "./pages/Privacy";
import ContactPage          from "./pages/Contact";
import AboutPage            from "./pages/About";
import PricingPage          from "./pages/Pricing";
import FaqPage              from "./pages/Faq";
import PromoVideo           from "./pages/marketing/PromoVideo";
import InstagramPost        from "./pages/marketing/InstagramPost";
import InstagramStory       from "./pages/marketing/InstagramStory";
import LinkedInBanner       from "./pages/marketing/LinkedInBanner";
import Brochure             from "./pages/marketing/Brochure";

export default function App() {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  return (
    <Router base={base}>
      <Switch>
        <Route path="/register"              component={Register} />
        <Route path="/join/:slug"            component={Join} />
        <Route path="/activate"              component={Activate} />
        <Route path="/payment-success"       component={PaymentSuccessPage} />
        <Route path="/payment-cancelled"     component={PaymentCancelledPage} />
        <Route path="/payment-batch"         component={PaymentBatchPage} />
        <Route path="/billing-success"       component={BillingSuccessPage} />
        <Route path="/billing-cancel"        component={BillingCancelPage} />
        <Route path="/stripe-return"         component={StripeReturnPage} />
        <Route path="/terms"                 component={TermsPage} />
        <Route path="/privacy"               component={PrivacyPage} />
        <Route path="/contact"               component={ContactPage} />
        <Route path="/about"                 component={AboutPage} />
        <Route path="/pricing"               component={PricingPage} />
        <Route path="/faq"                   component={FaqPage} />
        <Route path="/marketing/promo-video" component={PromoVideo} />
        <Route path="/marketing/instagram-post"   component={InstagramPost} />
        <Route path="/marketing/instagram-story"  component={InstagramStory} />
        <Route path="/marketing/linkedin-banner"  component={LinkedInBanner} />
        <Route path="/marketing/brochure"    component={Brochure} />
        <Route component={Landing} />
      </Switch>
    </Router>
  );
}
