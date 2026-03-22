import { render, screen, fireEvent } from "@testing-library/react";
import App from "../App";

const mockUseAuth = vi.fn();
const mockGetSessionDetail = vi.fn();
const mockStopStory = vi.fn();
let mockStatus = "idle";
let mockSections: unknown[] = [];
let mockSessions: Array<Record<string, unknown>> = [];

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("../components/Scene", () => ({
  Scene: () => <div data-testid="scene-3d" />,
}));

vi.mock("../hooks/useStoryteller", () => ({
  useStoryteller: () => ({
    status: mockStatus,
    sections: mockSections,
    currentMusic: null,
    startStory: vi.fn(),
    stopStory: mockStopStory,
  }),
}));

vi.mock("../hooks/useSessions", () => ({
  useSessions: () => ({
    sessions: mockSessions,
    loading: false,
    error: null,
    fetchSessions: vi.fn(),
    getSessionDetail: mockGetSessionDetail,
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
  }),
}));

function auth(user: Record<string, unknown> | null = null) {
  mockUseAuth.mockReturnValue({
    user: user ?? { uid: "u1", email: "test@test.com", displayName: "Test User", photoURL: null },
    loading: false,
    signOut: vi.fn(),
    getIdToken: vi.fn().mockResolvedValue("token"),
  });
}

describe("App shell wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    mockStatus = "idle";
    mockSections = [];
    mockSessions = [];
    mockGetSessionDetail.mockResolvedValue({ interactions: [] });
  });

  it("toggles sidebar open and closed", () => {
    auth();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /close sidebar/i }));
    expect(screen.getAllByRole("button", { name: /open sidebar/i }).length).toBeGreaterThan(0);
  });

  it("session selection triggers hydration path", async () => {
    auth();
    mockSessions = [{ session_id: "sess-1", title: "Hydrated Story", status: "active", created_at: null, updated_at: null, interaction_count: 1, preview: "Persisted opening" }];
    mockGetSessionDetail.mockResolvedValue({
      session_id: "sess-1",
      title: "Hydrated Story",
      status: "active",
      created_at: null,
      updated_at: null,
      interactions: [{ role: "elora", text: "Persisted opening", timestamp: "2026-01-01T00:00:00Z" }],
    });
    render(<App />);
    fireEvent.click(screen.getByText("Hydrated Story"));
    expect(mockStopStory).toHaveBeenCalled();
    expect(mockGetSessionDetail).toHaveBeenCalledWith("sess-1");
    expect(await screen.findByText("Persisted opening")).toBeInTheDocument();
  });

  it("new story clears hydrated state", async () => {
    auth();
    mockSessions = [{ session_id: "sess-1", title: "Hydrated Story", status: "active", created_at: null, updated_at: null, interaction_count: 1, preview: "Persisted opening" }];
    mockGetSessionDetail.mockResolvedValue({
      session_id: "sess-1",
      title: "Hydrated Story",
      status: "active",
      created_at: null,
      updated_at: null,
      interactions: [{ role: "elora", text: "Persisted opening", timestamp: "2026-01-01T00:00:00Z" }],
    });
    render(<App />);
    fireEvent.click(screen.getByText("Hydrated Story"));
    expect(await screen.findByText("Persisted opening")).toBeInTheDocument();
    fireEvent.click(screen.getByText("New Story"));
    expect(screen.queryByText("Persisted opening", { selector: "p" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /begin the story/i })).toBeInTheDocument();
  });
});

