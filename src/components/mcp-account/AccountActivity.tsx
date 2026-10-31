import { Clock3, Sparkles } from "lucide-react"

export const AccountActivity = () => (
  <section
    id="panel-activity"
    role="tabpanel"
    aria-labelledby="tab-activity"
    className="panel activity-panel"
  >
    <div className="section-heading">
      <div>
        <p className="eyebrow">YOUR CREATIVE HISTORY</p>
        <h2>A little space for big ideas.</h2>
      </div>
      <span className="soft-badge">Coming soon</span>
    </div>
    <div className="empty-state">
      <span className="empty-icon">
        <Clock3
          size={28}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </span>
      <h3>Your next chapter starts here.</h3>
      <p>
        When generation and billing launch, your creations, charges and refunds
        will have a home here.
      </p>
      <span className="empty-caption">
        <Sparkles
          size={14}
          aria-hidden="true"
        />
        No generation or credit history is available yet.
      </span>
    </div>
  </section>
)
