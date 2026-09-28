export default class FailOnSkippedTestsReporter {
  skippedTests = [];

  onTestEnd(test, result) {
    if (result.status === "skipped") this.skippedTests.push(test.titlePath().join(" › "));
  }

  onEnd() {
    if (this.skippedTests.length === 0) return;
    console.error(`Required browser scenarios may not be skipped:\n- ${this.skippedTests.join("\n- ")}`);
    return { status: "failed" };
  }

  printsToStdio() {
    return false;
  }
}
