import { Request, Response, NextFunction } from 'express';
import { executionContextMiddleware } from '../middleware';

describe('executionContextMiddleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonFn: jest.Mock;
  let statusFn: jest.Mock;

  beforeEach(() => {
    jsonFn = jest.fn();
    statusFn = jest.fn().mockReturnValue({ json: jsonFn });
    mockRes = {
      locals: {},
      status: statusFn,
    } as any;
    mockNext = jest.fn();
  });

  it('should reject request without x-execution-id header', () => {
    mockReq = {
      headers: {
        'x-parent-span-id': 'span-123',
      },
    };

    executionContextMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'EXECUTION_CONTEXT_ERROR',
        }),
      }),
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should reject request without x-parent-span-id header', () => {
    mockReq = {
      headers: {
        'x-execution-id': 'exec-123',
      },
    };

    executionContextMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'EXECUTION_CONTEXT_ERROR',
          message: expect.stringContaining('parent_span_id'),
        }),
      }),
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should reject request with no execution headers at all', () => {
    mockReq = {
      headers: {},
    };

    executionContextMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should pass with valid execution context headers', () => {
    mockReq = {
      headers: {
        'x-execution-id': 'exec-abc',
        'x-parent-span-id': 'span-def',
      },
    };

    executionContextMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(statusFn).not.toHaveBeenCalled();
  });

  it('should set executionContext on res.locals', () => {
    mockReq = {
      headers: {
        'x-execution-id': 'exec-abc',
        'x-parent-span-id': 'span-def',
      },
    };

    executionContextMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.locals!.executionContext).toEqual({
      execution_id: 'exec-abc',
      parent_span_id: 'span-def',
    });
  });

  it('should create a repo span on res.locals', () => {
    mockReq = {
      headers: {
        'x-execution-id': 'exec-abc',
        'x-parent-span-id': 'span-def',
      },
    };

    executionContextMiddleware(mockReq as Request, mockRes as Response, mockNext);

    const repoSpan = mockRes.locals!.repoSpan;
    expect(repoSpan).toBeDefined();
    expect(repoSpan.type).toBe('repo');
    expect(repoSpan.repo_name).toBe('policy-engine');
    expect(repoSpan.parent_span_id).toBe('span-def');
    expect(repoSpan.status).toBe('running');
    expect(repoSpan.span_id).toBeDefined();
    expect(repoSpan.start_time).toBeDefined();
  });
});
