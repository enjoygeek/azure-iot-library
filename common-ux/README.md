<!--
TODO: flesh this out more
-->
# @azure-iot/common-ux

This package contains a number of bundled components shared across the Reference UXs.

## Consumption

    <script src="node_modules/@azure-iot/common-ux/client.js"></script>

    import {Grid} from '@azure-iot/common-ux/grid'

## Building Locally

When you build locally, it will add a number of .d.ts to your root: these are intended for the package consumption. In addition to that, it will add an 'unpacked.js', which doesn't have any of the templates/styles resolved, a 'client.js' which is unminified and includes the templates/styles, and a 'client.min.js' which is the same (but minified).

Remember to git clean frequently. Specifically:

    git clean -fx

## Grid

The grid is minimally used like this:

    <grid [source]="..." [configuration]="..."></grid>

Where `source` is an array, and `configuration` is an instance of a grid configuration.

It optionally can have three other parameters:

    [poll]="..." [resources]="..." [currentPresentation]="..."
    
`poll` can be used to control polling; when passed 'true' it is intended to start polling, when passed 'false' it is intended to stop polling, and when no arguments are passed it is expected to return whether or not it is polling.

`resources` can be used to override resources; when not present, the default resources will be used. If present and a resource string that is expected is missing, the default resource will also be used.

`currentPresentation` can be used to control the grid's presentation format (currently grid or list) at various responsive breakpoints. By default, the grid will display in list form regardless of width. A custom configuration might look something like the code below. Ensure that this configuration is created as a singleton with a lifetime of the entire application, as it is not cleaned up when a grid is destroyed:

    import {GridBodyPresentation, PresentationOnBreakpoint} from '@azure-iot/common-ux/grid';
    
    /**
     * Responsive presentation information for all grids
     */
    export const GridBreakpoints = PresentationOnBreakpoint([
        {
            breakpoint: 0,
            presentation: GridBodyPresentation.List
        },
        {
            breakpoint: 480,
            presentation: GridBodyPresentation.Rows
        }
    ]);
    
You can then use the `GridBreakpoints` variable as the value for `currentPresentation`.

Additionally you can use the performance spy and it will add break downs by column.

### Selection

In the configuration, there is a selection style enumerator. When it is 0, it means that selection is disabled and clicking will not change the selected rows. If it is 1, then it means that a single value can be selected and it will display a checkbox. If it is 2, then it will mean multiple values can be selected; when in this mode, clicking an already selected row will deselect it.

In any selection case, you can bind to selection changed events like this:

    (selectionChanged)="F($event)"
    
`$event` is an array of the currently selected rows. In the single select case, it will be an array with one item in it.

### Detailed performance diagnostics

If you add the performance spy below on the grid, it will have additional groups for each column and the total rows.

## Modal

The modal is used like this:

    <modal>...</modal>

The contents of the modal can be bound to in the parent scope. Different modal types should have different elements. You can then enable and disable them through the use of a boolean flag.

## Performance Spy

The performance spy can be used to spy on the performance of your angular2 components. It will log how long it will take to initialize and perform a check.

It can be used like this:

    <ANYTHING spy-performance ...></ANYTHING>
    
When this is added, it will then begin to measure performance. It will log it to the console when events occur (up to once a second). Messages look like this:

    PERFORMANCE SPY INFORMATION:
      Spies: 98
      Number of destroys: 0
      Init Performance:
        
      Check Performance:
        column-0: 28 : 147857.14ns
        column-1: 28 : 2142.8571ns
        column-2: 28 : 2678.5714ns
        column-3: 28 : 1964.2857ns

If you have `spy-performance="column-0"` then it will group measurements across multiple directive instances.

You can also programmatically control if a spy is enabled with the attribute `spy-performance-enabled` which needs to be bound to a boolean value (like in the grid example).

You can also universally turn of performance logging by setting the global check to false:

    import {PerformanceSpy} from '@azure-iot/common-ux/performance-spy';
    
    PerformanceSpy.globallyEnabled = false

## Set Editor

The set editor lets you add/remove available items from a current set, like when selecting columns.

It is used like this:

    <set-editor [available]="..." [current]="..." [getLabel]="..."></set-editor>

Where `available` is an observable of the available options, `current` is a behavior subject of the current set of options, and `getLabel` is a function which takes a single argument of an option and returns a string to present in the UX.

It is optionally passed a `getId` function which behaves like getLabel but is used to uniquely identify options.

## List Group

List group is like a multi-select control, but because it isn't native it doesn't change in appearance across browsers.

It is used like this:

    <list-group [options]="..." [selection]="..." [getLabel]="..."></list-group>
    
Where `options` is an array of the current options, `selection` is a behavior subject that is updated whenever changes occur, and `getLabel` is a function function which takes a single argument of an option and returns a string to present in the UX.

It is optionally passed a `getId` function which behaves like getLabel but is used to uniquely identify options.

## Theme

Including the theme folder as part of your sass compile will allow you to use the included variables. The path when installed looks like:

    ./node_modules/@azure-iot/common-ux/theme

Once you've done that, you can import anything in that directory in the following form:

    @import 'common-theme';
