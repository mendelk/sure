import { Controller } from "@hotwired/stimulus";
import { initializeWebPushSession } from "utils/web_push_session";

export default class extends Controller {
  static values = {
    userId: String,
    sessionId: String,
    enabled: Boolean,
    configured: Boolean,
    createUrl: String,
  };

  connect() {
    this.cleanup = initializeWebPushSession({
      userId: this.userIdValue,
      sessionId: this.sessionIdValue,
      enabled: this.enabledValue,
      configured: this.configuredValue,
      createUrl: this.createUrlValue,
    });
  }

  disconnect() {
    this.cleanup?.();
  }
}
