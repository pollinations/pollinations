import Markdown from 'markdown-to-jsx';
import useContent from '../../hooks/useContent';

function InstructionsView() {
  const content = useContent('instructions');

  return <Markdown>{content}</Markdown>;
}

export default InstructionsView;
