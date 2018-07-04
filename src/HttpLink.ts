import {Injectable} from '@angular/core';
import {HttpClient, HttpEvent, HttpEventType} from '@angular/common/http';
import {
  ApolloLink,
  Observable as LinkObservable,
  Operation,
  RequestHandler,
  FetchResult,
} from 'apollo-link';
import {print} from 'graphql/language/printer';
import {
  Options,
  Context,
  mergeHeaders,
  prioritize,
} from 'apollo-angular-link-http-common';

import { fetch } from './utils';

import {RequestOperation, Request} from './types';
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
        const files: any[] = extractFiles(operation);
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
            // support for file name for Blob, (filename must be added as parameter)
            // https://developer.mozilla.org/en-US/docs/Web/API/FormData/append
            body.append(index, file, file.name);
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

        const sub = fetch(req, this.httpClient).subscribe((event: HttpEvent<any>) =>{
            if(event.type === HttpEventType.UploadProgress && files.length && context.onUploadProgress){
              const progress = Math.round(100 * event.loaded / event.total);
              context.onUploadProgress.next(progress);            
            } else if (event.type === HttpEventType.Response) {
              observer.next(event.body);
              if(context.onUploadProgress){
                context.onUploadProgress.complete();
              }
            }
        },
        (err:  any) => observer.error(err),
        () => observer.complete()
      );

        // const sub = fetch(req, this.httpClient).subscribe({
          
        //   next: result => observer.next(result.body),
        //   error: err => observer.error(err),
        //   complete: () => observer.complete(),
        // });

        return () => {
          if (!sub.closed) {
            sub.unsubscribe();
          }
        };
      });
  }

  public request(op: Operation): LinkObservable<FetchResult> | null {
    return this.requester(op);
  }
}

@Injectable()
export class HttpLink {
  constructor(private httpClient: HttpClient) {}

  public create(options: Options): HttpLinkHandler {
    return new HttpLinkHandler(this.httpClient, options);
  }
}
