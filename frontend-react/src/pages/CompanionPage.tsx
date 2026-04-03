/**
 * CompanionPage — Pre-story chat with Elora at `/companion`.
 *
 * Renders the CompanionChat panel. When Elora proposes a story
 * and the user clicks "Start the Journey", it triggers story generation
 * and navigates to `/story/live`.
 */

import { useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { CompanionChat } from '../components/CompanionChat';
import type { AppOutletContext } from '../App';

export function CompanionPage() {
  const navigate = useNavigate();
  const {
    chatMessages,
    chatStreaming,
    sendMessage,
    clearMessages,
    proposal,
    dismissProposal,
    companionSessionId,
    startStory,
    fetchSessions,
  } = useOutletContext<AppOutletContext>();

  const handleStartJourney = useCallback(() => {
    if (!proposal) return;
    const storyPrompt = `${proposal.title}: ${proposal.brief}`;
    void startStory(storyPrompt, companionSessionId ?? undefined);
    void fetchSessions();
    navigate('/story/live');
  }, [proposal, companionSessionId, startStory, fetchSessions, navigate]);

  const handleNotReady = useCallback(() => {
    dismissProposal();
    sendMessage("I'm not ready yet, let's keep talking.");
  }, [dismissProposal, sendMessage]);

  const handleClear = useCallback(() => {
    clearMessages();
    navigate('/');
  }, [clearMessages, navigate]);

  return (
    <CompanionChat
      messages={chatMessages}
      isStreaming={chatStreaming}
      onSend={sendMessage}
      onClear={handleClear}
      proposal={proposal}
      onStartJourney={handleStartJourney}
      onNotReady={handleNotReady}
      visible={true}
    />
  );
}
