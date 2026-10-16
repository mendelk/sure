import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["refresh"];

  received() {
    // Do not replace the page under a reader's pointer or announce every push
    // through the desktop shell's native alert bridge.
    this.refreshTarget.classList.remove("hidden");
  }
}
