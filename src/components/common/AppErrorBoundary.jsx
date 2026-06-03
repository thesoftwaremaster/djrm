import { Component } from 'react'
import { Link } from 'react-router-dom'

class AppErrorBoundary extends Component {
  state = {
    hasError: false,
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.error(error)
  }

  handleReset = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left text-sm text-rose-700">
        <p className="font-semibold">This page could not be shown.</p>
        <p className="mt-1">
          Return to the dashboard and try again. If it repeats, reload the app before continuing.
        </p>
        <Link
          to="/dashboard"
          onClick={this.handleReset}
          className="mt-3 inline-flex font-medium text-rose-800 underline"
        >
          Back to dashboard
        </Link>
      </div>
    )
  }
}

export default AppErrorBoundary
