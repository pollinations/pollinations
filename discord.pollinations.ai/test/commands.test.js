const { imagine } = require('../src/commands/imagine');
const { chat } = require('../src/commands/chat');

describe('Commands', () => {
  let mockInteraction;

  beforeEach(() => {
    mockInteraction = {
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      options: {
        getString: jest.fn()
      }
    };
  });

  describe('imagine command', () => {
    test('handles successful image generation', async () => {
      mockInteraction.options.getString
        .mockReturnValueOnce('a beautiful sunset') // prompt
        .mockReturnValueOnce('sdxl'); // model

      await imagine.execute(mockInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledTimes(2);
      expect(mockInteraction.editReply).toHaveBeenLastCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Generated image')
        })
      );
    });

    test('handles errors gracefully', async () => {
      mockInteraction.options.getString
        .mockReturnValueOnce('invalid prompt')
        .mockReturnValueOnce('sdxl');

      await imagine.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenLastCalledWith(
        expect.stringContaining('error')
      );
    });
  });

  describe('chat command', () => {
    test('handles successful text generation', async () => {
      mockInteraction.options.getString
        .mockReturnValueOnce('Hello AI!')
        .mockReturnValueOnce('gpt-3.5-turbo');

      await chat.execute(mockInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledTimes(2);
      expect(mockInteraction.editReply).toHaveBeenLastCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('AI Response')
        })
      );
    });

    test('handles errors gracefully', async () => {
      mockInteraction.options.getString
        .mockReturnValueOnce('invalid message')
        .mockReturnValueOnce('gpt-3.5-turbo');

      await chat.execute(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenLastCalledWith(
        expect.stringContaining('error')
      );
    });
  });
});