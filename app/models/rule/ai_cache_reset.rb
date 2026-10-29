class Rule::AiCacheReset
  def initialize(family:, user:, source:)
    @family, @user, @source = family, user, source
  end

  def enqueue
    perform_later
    DebugLogEntry.capture(
      category: ClearAiCacheJob::DEBUG_CATEGORY,
      level: "info",
      message: "AI cache reset requested from the rules page",
      source: source,
      family: family,
      user: user
    )
  end

  private
    attr_reader :family, :user, :source

    # Rescue only the enqueue, never a failure after the job has landed.
    def perform_later
      attempted_job = nil
      enqueued = ClearAiCacheJob.perform_later(family) { |job| attempted_job = job }
      return if enqueued

      raise attempted_job&.enqueue_error || ActiveJob::EnqueueError.new("ClearAiCacheJob was not enqueued")
    rescue => e
      DebugLogEntry.capture(
        category: ClearAiCacheJob::DEBUG_CATEGORY,
        level: "error",
        message: "AI cache reset could not be enqueued: #{e.class}: #{e.message}",
        source: source,
        family: family,
        user: user,
        metadata: { error_class: e.class.name, error_message: e.message }
      )
      raise
    end
end
