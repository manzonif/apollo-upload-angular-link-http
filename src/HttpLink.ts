import {Injectable} from '@angular/core';
import {HttpClient, HttpResponse, HttpParams} from '@angular/common/http';
import {
  ApolloLink,
  Observable as LinkObservable,
  Operation,
  RequestHandler,
} from 'apollo-link';
import {print} from 'graphql/language/printer';
import {ExecutionResult} from 'graphql';
import {Observable} from 'rxjs/Observable';

import {Options, Request, Context, RequestOperation} from './types';
import {mergeHeaders, prioritize} from './utils';
import extractFiles from 'extract-files';

// XXX find a better name for it
export class HttpLinkHandler extends ApolloLink {
  public requester: RequestHandler;

  constructor(private httpClient: HttpClient, private options: Options) {
    super();

    this.requester = (operation: Operation) =>
      new LinkObservable((observer: any) => {
        const context: Context = operation.getContext();

        // decides which value to pick, Context, Options or to just use the default
        const pick = <K extends keyof Context | keyof Options>(
          key: K,
          init?: Context[K] | Options[K],
        ): Context[K] | Options[K] => {
          return prioritize(context[key], this.options[key], init);
        };

        const includeQuery = pick('includeQuery', true);
        const includeExtensions = pick('includeExtensions', false);
        const method = pick('method', 'POST');
        const url = pick('uri', 'graphql');
        const withCredentials = pick('withCredentials');

        const requestOperation: RequestOperation = { 
          operationName: operation.operationName,
          variables: operation.variables,       
        };
        if (includeExtensions) {
          requestOperation.extensions = operation.extensions;
        }

        if (includeQuery) {
          requestOperation.query = print(operation.query);
        }

        let body: any;
        const files: any[] = extractFiles(operation.variables);
        if (files.length) {
          // GraphQL multipart request spec:
          // https://github.com/jaydenseric/graphql-multipart-request-spec

          body = new FormData();
          body.append(
            'operations',
            JSON.stringify(requestOperation)
          );

          body.append(
            'map',
            JSON.stringify(
              files.reduce((map, { path }, index) => {
                map[`${index}`] = [path];
                return map;
              }, {})
            )
          );

          files.forEach(({ file }, index) => {
            body.append(index, file);
          });

        } else {
          body = requestOperation;
        }

        const req: Request = {
          method,
          url,
          body: body,
          options: {
            withCredentials,
            headers: this.options.headers,
          },
        };

        if (context.headers) {
          req.options.headers = mergeHeaders(
            req.options.headers,
            context.headers,
          );
        }

        const sub = this.fetch(req).subscribe({
          next: result => observer.next(result.body),
          error: err => observer.error(err),
          complete: () => observer.complete(),
        });

        return () => {
          if (!sub.closed) {
            sub.unsubscribe();
          }
        };
      });
  }

  public request(op: Operation): LinkObservable<ExecutionResult> | null {
    return this.requester(op);
  }

  // XXX make it as a separate package so it can be used in BatchLink
  private fetch(req: Request): Observable<HttpResponse<Object>> {
    const shouldUseBody =
      ['POST', 'PUT', 'PATCH'].indexOf(req.method.toUpperCase()) !== -1;
    const shouldStringify = (param: string) =>
      ['variables', 'extensions'].indexOf(param.toLowerCase()) !== -1;

    // `body` for some, `params` for others
    let bodyOrParams = {};

    if (shouldUseBody) {
      bodyOrParams = {
        body: req.body,
      };
    } else {
      const params = Object.keys(req.body).reduce((httpParams, param) => {
        let val: string = (req.body as any)[param];
        if (shouldStringify(param.toLowerCase())) {
          val = JSON.stringify(val);
        }
        return httpParams.set(param, val);
      }, new HttpParams());

      bodyOrParams = {params};
    }

    // create a request
    return this.httpClient.request<Object>(req.method, req.url, {
      observe: 'response',
      responseType: 'json',
      reportProgress: false,
      ...bodyOrParams,
      ...req.options,
    });
  }
}

@Injectable()
export class HttpLink {
  constructor(private httpClient: HttpClient) {}

  public create(options: Options): HttpLinkHandler {
    return new HttpLinkHandler(this.httpClient, options);
  }
}
